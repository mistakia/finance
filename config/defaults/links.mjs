// Default link format rules for merchants and institutions
// Account links use format: /{owner}/{institution}/{account-type}/{account-id}
export default {
  // Special institution/merchant mappings
  institutions: [
    {
      patterns: [/ally bank|ally financial/i],
      link: '/custodian/ally-bank'
    },
    {
      patterns: [/chase bank|jpmorgan|chase credit/i],
      link: '/creditor/chase'
    },
    {
      patterns: [/capital one|capitalone/i],
      link: '/creditor/capital-one'
    },
    {
      patterns: [/fidelity/i],
      link: '/custodian/fidelity'
    },
    {
      patterns: [/schwab/i],
      link: '/custodian/schwab'
    },
    {
      patterns: [/robinhood/i],
      link: '/custodian/robinhood'
    },
    {
      patterns: [/interactive brokers|ibkr/i],
      link: '/custodian/interactive-brokers'
    }
  ],

  // Common merchant mappings
  merchants: [
    {
      patterns: [/amazon|amzn/i],
      link: '/merchant/amazon'
    },
    {
      patterns: [/home depot|homedepot/i],
      link: '/merchant/home-depot'
    }
  ],

  // Government entity mappings
  government: [
    {
      patterns: [/irs|internal revenue|treasury|united states treasury/i],
      link: '/government/united-states'
    }
  ],

  // Default link format function for merchants not specifically mapped
  default_format: (clean_name) =>
    `/merchant/${clean_name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
}
