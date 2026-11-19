const assert = require('node:assert/strict');
const { test } = require('node:test');
const authorize = require('./dependabot-auto-merge.cjs');

function fixture() {
  const pr = {
    number: 123,
    node_id: 'PR_test',
    state: 'open',
    draft: false,
    user: { login: 'dependabot[bot]', type: 'Bot' },
    head: { sha: 'verified-head', repo: { full_name: 'owner/repo' } },
    base: { ref: 'master', repo: { full_name: 'owner/repo' } },
    commits: 1,
    changed_files: 2,
    auto_merge: null,
  };
  const dependencies = [{
    dependencyName: 'zod',
    packageEcosystem: 'npm_and_yarn',
    directory: '/',
    targetBranch: 'master',
    updateType: 'version-update:semver-minor',
    prevVersion: '4.3.6',
    newVersion: '4.6.6',
  }];
  const commits = [{
    sha: 'verified-head',
    author: { login: 'dependabot[bot]' },
    commit: { verification: { verified: true } },
  }];
  const files = [
    { filename: 'package.json', status: 'modified' },
    { filename: 'package-lock.json', status: 'modified' },
  ];
  const alert = {
    state: 'OPEN',
    vulnerableManifestPath: 'package-lock.json',
    dependabotUpdate: { pullRequest: { number: 123 } },
    securityVulnerability: {
      severity: 'HIGH',
      package: { name: 'zod', ecosystem: 'NPM' },
      firstPatchedVersion: { identifier: '4.6.6' },
    },
  };
  const rule = {
    type: 'required_status_checks',
    ruleset_id: 1,
    parameters: {
      strict_required_status_checks_policy: true,
      required_status_checks: [
        { context: 'build', integration_id: 15368 },
        { context: 'dependabot-security-policy', integration_id: 15368 },
      ],
    },
  };
  const ruleset = { enforcement: 'active', current_user_can_bypass: 'never' };
  const pages = [{ nodes: [alert], pageInfo: { hasNextPage: false, endCursor: null } }];
  const calls = [];
  const notices = [];
  const listCommits = Symbol('commits');
  const listFiles = Symbol('files');
  const github = {
    rest: {
      pulls: { get: async () => ({ data: pr }), listCommits, listFiles },
    },
    paginate: async (method) => {
      if (method === listCommits) return commits;
      assert.equal(method, listFiles);
      return files;
    },
    request: async (route) => {
      if (route.includes('/rules/branches/')) return { data: [rule] };
      assert.ok(route.includes('/rulesets/'));
      return { data: ruleset };
    },
    graphql: async (query, variables) => {
      calls.push({ query, variables });
      if (query.includes('vulnerabilityAlerts')) {
        return { repository: { vulnerabilityAlerts: pages.shift() } };
      }
      return {};
    },
  };
  const context = {
    repo: { owner: 'owner', repo: 'repo' },
    payload: { pull_request: { number: 123, head: { sha: 'verified-head' } } },
  };
  const run = () => authorize({
    github, context, dependencies, core: { notice: (message) => notices.push(message) },
  });
  const enabled = () => calls.filter(({ query }) => query.includes('enablePullRequestAutoMerge'));
  return { pr, dependencies, commits, files, alert, rule, ruleset, pages, calls, notices, github, run, enabled };
}

for (const severity of ['LOW', 'MODERATE', 'HIGH', 'CRITICAL']) {
  for (const update of ['patch', 'minor']) {
    test(`Authorizes a linked ${severity} security repair with a ${update} update`, async () => {
      const state = fixture();
      state.alert.securityVulnerability.severity = severity;
      state.dependencies[0].updateType = `version-update:semver-${update}`;
      await state.run();
      assert.equal(state.enabled().length, 1);
      assert.deepEqual(state.enabled()[0].variables, { id: 'PR_test', head: 'verified-head' });
      assert.match(state.enabled()[0].query, /expectedHeadOid: \$head, mergeMethod: SQUASH/);
    });
  }
}

test('Does not authorize a routine PR that updates an affected package', async () => {
  const state = fixture();
  state.alert.dependabotUpdate = null;
  await state.run();
  assert.equal(state.enabled().length, 0);
  assert.match(state.notices[0], /No .*alert links this PR/);
});

test('Does not authorize an alert linked to another PR', async () => {
  const state = fixture();
  state.alert.dependabotUpdate.pullRequest.number = 456;
  await state.run();
  assert.equal(state.enabled().length, 0);
});

test('Removes an old authorization when a grouped update contains a major update', async () => {
  const state = fixture();
  state.pr.auto_merge = {};
  state.dependencies.push({ ...state.dependencies[0], updateType: 'version-update:semver-major' });
  await state.run();
  assert.equal(state.enabled().length, 0);
  assert.ok(state.calls[0].query.includes('disablePullRequestAutoMerge'));
  assert.match(state.notices[0], /major update/);
});

test('Removes an old authorization when the PR becomes a draft', async () => {
  const state = fixture();
  state.pr.auto_merge = {};
  state.pr.draft = true;
  await state.run();
  assert.equal(state.enabled().length, 0);
  assert.ok(state.calls[0].query.includes('disablePullRequestAutoMerge'));
});

for (const [description, change] of [
  ['an arbitrary author', (state) => { state.pr.user.login = 'maintainer'; }],
  ['a fork', (state) => { state.pr.head.repo.full_name = 'fork/repo'; }],
  ['another target', (state) => { state.pr.base.ref = 'other'; }],
  ['a changed head', (state) => { state.pr.head.sha = 'new-head'; }],
  ['an unsigned commit', (state) => { state.commits[0].commit.verification.verified = false; }],
  ['a human commit', (state) => { state.commits[0].author.login = 'maintainer'; }],
  ['a truncated commit list', (state) => { state.pr.commits = 2; }],
  ['an application change', (state) => { state.files[0].filename = 'src/main.tsx'; }],
  ['a removed lockfile', (state) => { state.files[1].status = 'removed'; }],
  ['a missing lockfile', (state) => { state.files.pop(); state.pr.changed_files = 1; }],
  ['unknown metadata', (state) => { state.dependencies[0].updateType = ''; }],
  ['another ecosystem', (state) => { state.dependencies[0].packageEcosystem = 'pip'; }],
  ['a missing repair', (state) => { state.alert.securityVulnerability.firstPatchedVersion = null; }],
  ['an inactive ruleset', (state) => { state.ruleset.enforcement = 'disabled'; }],
  ['an App bypass', (state) => { state.ruleset.current_user_can_bypass = 'always'; }],
  ['an unknown App bypass state', (state) => { delete state.ruleset.current_user_can_bypass; }],
  ['loose required checks', (state) => { state.rule.parameters.strict_required_status_checks_policy = false; }],
  ['a missing policy requirement', (state) => { state.rule.parameters.required_status_checks.pop(); }],
  ['an untrusted check source', (state) => { state.rule.parameters.required_status_checks[0].integration_id = null; }],
]) {
  test(`Rejects ${description}`, async () => {
    const state = fixture();
    change(state);
    await assert.rejects(state.run);
    assert.equal(state.enabled().length, 0);
  });
}

test('Reads all alert pages before it makes the authorization decision', async () => {
  const state = fixture();
  state.pages.unshift({ nodes: [], pageInfo: { hasNextPage: true, endCursor: 'next-page' } });
  await state.run();
  assert.equal(state.calls[1].variables.after, 'next-page');
  assert.equal(state.enabled().length, 1);
});

test('Reports an alert API error without authorizing a merge', async () => {
  const state = fixture();
  state.github.graphql = async () => { throw new Error('API unavailable'); };
  await assert.rejects(state.run, /API unavailable/);
  assert.equal(state.enabled().length, 0);
});

test('Reports a native auto-merge API error', async () => {
  const state = fixture();
  const graphql = state.github.graphql;
  state.github.graphql = async (query, variables) => {
    if (query.includes('enablePullRequestAutoMerge')) throw new Error('Revision changed');
    return graphql(query, variables);
  };
  await assert.rejects(state.run, /Revision changed/);
});
