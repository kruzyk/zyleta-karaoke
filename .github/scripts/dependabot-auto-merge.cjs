const bot = 'dependabot[bot]';
const allowedUpdates = new Set([
  'version-update:semver-patch',
  'version-update:semver-minor',
  'version-update:semver-major',
]);
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
    throw new Error('Only root npm dependency updates can receive auto-merge authorization.');
  }
  if (dependencies.some((dependency) => !allowedUpdates.has(dependency.updateType))) {
    throw new Error('Dependabot did not identify every update as patch, minor, or major.');
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
  core.notice('GitHub enabled native auto-merge for this dependency update. All required checks must pass before GitHub merges it.');
};
