const bot = 'dependabot[bot]';
const allowedUpdates = new Set(['version-update:semver-patch', 'version-update:semver-minor']);
const requiredChecks = ['build', 'dependabot-security-policy'];
const actionsAppId = 15368;

module.exports = async function authorize({ github, context, core, dependencies }) {
  const coordinates = { ...context.repo, pull_number: context.payload.pull_request.number };
  const { data: pr } = await github.rest.pulls.get(coordinates);
  const repository = `${context.repo.owner}/${context.repo.repo}`;

  if (
    pr.user.login !== bot ||
    pr.user.type !== 'Bot' ||
    pr.head.repo?.full_name !== repository ||
    pr.base.repo.full_name !== repository ||
    pr.base.ref !== 'master' ||
    pr.head.sha !== context.payload.pull_request.head.sha
  ) {
    throw new Error('The PR identity, target, or revision changed. Do not authorize auto-merge.');
  }
  if (pr.state !== 'open') {
    throw new Error('The PR is not open.');
  }

  if (pr.auto_merge) {
    await github.graphql(
      'mutation($id: ID!) { disablePullRequestAutoMerge(input: {pullRequestId: $id}) { clientMutationId } }',
      { id: pr.node_id },
    );
  }

  if (pr.draft) {
    core.notice('The PR is a draft. Auto-merge remains disabled.');
    return;
  }
  if (!Array.isArray(dependencies) || dependencies.length === 0) {
    throw new Error('Dependabot did not supply dependency metadata.');
  }
  if (dependencies.some((dependency) =>
    dependency.packageEcosystem !== 'npm_and_yarn' ||
    dependency.directory !== '/' ||
    dependency.targetBranch !== 'master'
  )) {
    throw new Error('Only root npm security updates can receive auto-merge authorization.');
  }
  if (dependencies.some((dependency) => dependency.updateType === 'version-update:semver-major')) {
    core.notice('The PR contains a major update. A maintainer must approve and merge it.');
    return;
  }
  if (dependencies.some((dependency) => !allowedUpdates.has(dependency.updateType))) {
    throw new Error('Dependabot did not identify every update as patch or minor.');
  }

  const commits = await github.paginate(github.rest.pulls.listCommits, { ...coordinates, per_page: 100 });
  if (
    commits.length === 0 ||
    commits.length !== pr.commits ||
    !commits.some((commit) => commit.sha === pr.head.sha) ||
    commits.some((commit) => commit.author?.login !== bot || !commit.commit.verification?.verified)
  ) {
    throw new Error('Every PR commit must have a verified Dependabot signature.');
  }
  const files = await github.paginate(github.rest.pulls.listFiles, { ...coordinates, per_page: 100 });
  if (
    files.length !== pr.changed_files ||
    !files.some((file) => file.filename === 'package-lock.json') ||
    files.some((file) =>
      !['package.json', 'package-lock.json'].includes(file.filename) || file.status !== 'modified'
    )
  ) {
    throw new Error('The PR must change only the npm manifest and lockfile, including the lockfile.');
  }

  const alerts = [];
  let after = null;
  do {
    const result = await github.graphql(`
      query($owner: String!, $repo: String!, $after: String) {
        repository(owner: $owner, name: $repo) {
          vulnerabilityAlerts(first: 100, after: $after, states: [OPEN]) {
            nodes {
              state
              vulnerableManifestPath
              dependabotUpdate { pullRequest { number } }
              securityVulnerability {
                severity
                package { name ecosystem }
                firstPatchedVersion { identifier }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`, { ...context.repo, after });
    const connection = result.repository?.vulnerabilityAlerts;
    if (!Array.isArray(connection?.nodes) || !connection.pageInfo) {
      throw new Error('GitHub did not return the security alerts.');
    }
    alerts.push(...connection.nodes);
    after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
    if (connection.pageInfo.hasNextPage && !after) {
      throw new Error('GitHub did not return the next security-alert cursor.');
    }
  } while (after);

  // An affected package alone does not prove that Dependabot created a security-update PR.
  const linkedAlerts = alerts.filter((alert) =>
    alert?.state === 'OPEN' &&
    alert.dependabotUpdate?.pullRequest?.number === pr.number &&
    alert.vulnerableManifestPath?.replace(/^\/+/, '') === 'package-lock.json' &&
    alert.securityVulnerability?.package.ecosystem === 'NPM' &&
    dependencies.some((dependency) => dependency.dependencyName === alert.securityVulnerability.package.name)
  );
  if (linkedAlerts.some((alert) => !alert.securityVulnerability.firstPatchedVersion?.identifier)) {
    throw new Error('GitHub did not report a repaired version for a linked security alert.');
  }
  if (!linkedAlerts.some((alert) =>
    ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].includes(alert.securityVulnerability.severity)
  )) {
    core.notice('No low, moderate, high, or critical alert links this PR to a security update. Auto-merge remains disabled.');
    return;
  }

  const { data: rules } = await github.request('GET /repos/{owner}/{repo}/rules/branches/{branch}', {
    ...context.repo,
    branch: 'master',
  });
  const enforcedChecks = new Set();
  for (const rule of rules.filter((rule) => rule.type === 'required_status_checks')) {
    const { data: ruleset } = await github.request('GET /repos/{owner}/{repo}/rulesets/{ruleset_id}', {
      ...context.repo,
      ruleset_id: rule.ruleset_id,
    });
    if (
      ruleset.enforcement === 'active' &&
      ruleset.current_user_can_bypass === 'never' &&
      rule.parameters.strict_required_status_checks_policy
    ) {
      for (const check of rule.parameters.required_status_checks) {
        if (check.integration_id === actionsAppId) enforcedChecks.add(check.context);
      }
    }
  }
  if (!requiredChecks.every((check) => enforcedChecks.has(check))) {
    throw new Error('Require build and dependabot-security-policy from GitHub Actions, with strict checks and no App bypass.');
  }

  await github.graphql(`
    mutation($id: ID!, $head: GitObjectID!) {
      enablePullRequestAutoMerge(input: {
        pullRequestId: $id, expectedHeadOid: $head, mergeMethod: SQUASH
      }) {
        pullRequest { number }
      }
    }`, { id: pr.node_id, head: pr.head.sha });
  core.notice('GitHub enabled native auto-merge for this security update. All required checks must pass before GitHub merges it.');
};
