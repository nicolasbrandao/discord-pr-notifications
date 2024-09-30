const {
  INPUT_DISCORD_WEBHOOK_URL,
  INPUT_USERNAME_ID_MAP,
  PR_TITLE,
  PR_URL,
  PR_AUTHOR,
  PR_REVIEWER,
  PR_APPROVER,
  PR_REVIEWERS,
  PR_NUMBER,
  GITHUB_EVENT_TYPE,
  REVIEW_STATE,
  PR_MERGED,
  PR_IS_DRAFT,
  PR_BASE_BRANCH,
  PR_HEAD_BRANCH,
} = process.env;

const prMerged = PR_MERGED === 'true';

const parseDiscordMap = () => {
  try {
    return JSON.parse(INPUT_USERNAME_ID_MAP);
  } catch (error) {
    console.error('Error parsing USERNAME_ID_MAP:', error);
    return {};
  }
};

async function main() {
  const isDraft = PR_IS_DRAFT === 'true';
  const noReviewer = GITHUB_EVENT_TYPE === 'review_requested' && !PR_REVIEWER;
  if (isDraft || noReviewer) {
    console.log('PR is a draft or there is no reviewer, no message will be sent.');
    process.exit(0);
    return;
  }

  const discordUsersMap = parseDiscordMap();

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
  const parsedWebhookUrl = new URL(INPUT_DISCORD_WEBHOOK_URL ?? '');
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
