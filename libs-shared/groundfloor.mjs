import fetch from 'node-fetch'
import config from '#config'

export const getStairsAccount = async ({ token }) => {
  const query = `
query YieldInvestorProfile {
  yieldInvestorProfile {
    ...yieldInvestorProfileFragment
    __typename
  }
  savingsGoals {
    goalName
    goalAmount
    goalTargetDate
    id
    __typename
  }
}
fragment yieldInvestorProfileFragment on YieldInvestorProfile {
  currentYieldRate
  id
  account {
    id
    unsecureId
    createdAt
    type
    __typename
  }
  currentBalanceCents
  clearedBalanceCents
  accruedInterestCents
  accruedInterestCentsTick
  rollupEnabled
  investorRewardStatus {
    currentRewardInterestRate
    daysTilInterestRateIncrease
    interestRateAfterIncrease
    roundupReward
    fundsTransferScheduleReward
    daysTilRoundupReward
    daysTilFundsTransferScheduleReward
    manualFundsTransferScheduleRewardExpiresOn
    manualRoundupRewardExpiresOn
    __typename
  }
  __typename
}
  `
  const body = JSON.stringify({ query })
  const res = await fetch(config.groundfloor_api, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${token}`
    },
    body
  })

  const data = await res.json()

  if (data && data.data) {
    return data.data.yieldInvestorProfile
  }

  return null
}

export const getUserAccounts = async ({ token }) => {
  const query = `
query fetchUserByClient {
  fetchUserByClient {
    ...userFragment
    __typename
  }
}

fragment userFragment on User {
  id
  uuid
  myAccounts {
    ...accountFragment
    __typename
  }
  __typename
}

fragment accountFragment on Account {
  id
  unsecureId
  type
}
  `
  const body = JSON.stringify({ query })

  const res = await fetch(config.groundfloor_api, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${token}`
    },
    body
  })

  const data = await res.json()

  if (data && data.data) {
    return data.data.fetchUserByClient
  }

  return null
}

export const getGroundfloorBalances = async ({ token }) => {
  const user_data = await getUserAccounts({ token })

  if (!user_data) {
    return null
  }

  const investor_account = user_data.myAccounts.find(
    (a) => a.type === 'INVESTOR'
  )
  const query = `
query startPageAccountSummary($accountSecureId: ID!) {
  startPageAccountSummary(accountSecureId: $accountSecureId) {
    annualizedReturnOnClosedInvestments
    investableFundsAmountCents
    moneyAtWorkAmountCents
  }
}
  `
  const body = JSON.stringify({
    query,
    variables: { accountSecureId: investor_account.id },
    operationName: 'startPageAccountSummary'
  })
  const res = await fetch(config.groundfloor_api, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${token}`
    },
    body
  })

  const data = await res.json()

  if (data && data.data) {
    return data.data.startPageAccountSummary
  }

  return null
}
