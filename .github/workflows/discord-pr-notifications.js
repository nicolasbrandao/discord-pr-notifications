const core = require('@actions/core');
const github = require('@actions/github');

async function main() {
  const discordWebhookUrl = core.getInput('discord_webhook_url');
  const usernameIdMapInput = core.getInput('username_id_map');

  const { context } = github;
  const { payload, eventName } = context;

  if (!payload.pull_request) {
    console.log('This event is not a pull request event. Exiting.');
    process.exit(0);
  }

  const pr = payload.pull_request;
  const PR_TITLE = pr.title;
  const PR_URL = pr.html_url;
  const PR_AUTHOR = pr.user.login;
  const PR_NUMBER = pr.number;
  const PR_IS_DRAFT = pr.draft;
  const PR_BASE_BRANCH = pr.base.ref;
  const PR_HEAD_BRANCH = pr.head.ref;
  const PR_MERGED = pr.merged;
  const PR_REVIEWERS = pr.requested_reviewers.map((reviewer) => reviewer.login);
  const PR_REVIEWER = payload.requested_reviewer?.login || '';
  const PR_APPROVER = payload.review?.user?.login || '';
  const REVIEW_STATE = payload.review?.state || '';
  const GITHUB_EVENT_TYPE = eventName;

  const prMerged = PR_MERGED === 'true';

  const isDraft = PR_IS_DRAFT === 'true';
  const noReviewer = GITHUB_EVENT_TYPE === 'review_requested' && !PR_REVIEWER;
  if (isDraft || noReviewer) {
    console.log('PR is a draft or there is no reviewer, no message will be sent.');
    process.exit(0);
    return;
  }

  let discordUsersMap = {};
  try {
    discordUsersMap = JSON.parse(usernameIdMapInput);
  } catch (error) {
    console.error('Error parsing USERNAME_ID_MAP:', error);
    process.exit(1);
  }

  const parsePrReviewers = (reviewers) => {
    try {
      const reviewersArray = JSON.parse(reviewers);
      if (!reviewersArray || reviewersArray.length === 0)
        return 'No reviewers assigned 😿';
      return reviewersArray.map(parseUser).join(', ');
    } catch (error) {
      console.error('Error parsing reviewers:', error);
      return 'Error parsing reviewers 😿';
    }
  };

  const parseUser = (user) => {
    const userId = discordUsersMap[user] || user;
    return `<@${userId}>`;
  };

  const getBranchWithEmoji = (branchName) => {
    const branchEmojis = {
      main: '🌳',
      preview: '🧪',
      qa: '🔍',
    };
  
    const emoji = branchEmojis[branchName] ? `${branchEmojis[branchName]} ` : '';
    return `${emoji}${branchName}`;
  };

  const generateContent = () => {
    const createMessage = (emoji, title, showReviewers = false) => {
      const reviwers = `> - Reviewers: ${parsePrReviewers(PR_REVIEWERS)}`;
      const branchesLine = `> - Branching: \`${getBranchWithEmoji(PR_HEAD_BRANCH)}\` → \`${getBranchWithEmoji(PR_BASE_BRANCH)}\``;
      return `## ${emoji} ${title}: [PR #${PR_NUMBER}](<${PR_URL}>)
      > **${PR_TITLE}**
      > - Author: ${parseUser(PR_AUTHOR)}
      ${branchesLine}
      ${showReviewers ? reviwers : ''}`;
    };

    switch (GITHUB_EVENT_TYPE) {
      case 'ready_for_review':
        return createMessage('🆕', 'Pull Request Ready for Review', true);
      case 'review_requested':
        return createMessage('🔍', `${PR_REVIEWER ? `${parseUser(PR_REVIEWER)}'s ` : ''}Review Requested for`);
      case 'submitted':
        if (REVIEW_STATE === 'approved') {
          return createMessage('✅', `Pull Request Approved${PR_APPROVER ? ` by ${parseUser(PR_APPROVER)}` : ''}`);
        }

        if (REVIEW_STATE === 'changes_requested') {
          return createMessage('🔄', 'Changes Requested on');
        }

        break;
      case 'closed':
        if (prMerged) {
          return createMessage('🔀', 'Pull Request Merged');
        }

        return createMessage('❌', 'Pull Request Closed');
      case 'reopened':
        return createMessage('♻️', 'Pull Request Reopened', true);
    }

    throw new Error('Unsupported event type or state');
  };

  const message = {
    content: generateContent(),
    username: 'GitHub PR',
    embeds: [],
  };
  const parsedWebhookUrl = new URL(discordWebhookUrl ?? '');
  await fetch(parsedWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  }).then(() => console.log('Message sent to Discord'));
}

main().catch((error) => {
  console.error('Error sending message to Discord:', error);
  process.exit(0);
});
