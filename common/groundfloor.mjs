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

  return {}
}
