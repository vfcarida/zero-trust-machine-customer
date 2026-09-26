# Open Policy Agent (OPA) Rego Policy for Zero Trust Machine Customer
package machine_customer.authz

import future.keywords.in

default allow = false

# Allowed merchants list
default_allowlisted_merchants = [
    "aws_compute",
    "partssource_corp",
    "google_cloud_m2m",
    "mcmaster_carr"
]

# Rule: Allow transaction if Guard Mode is satisfied, merchant is allowed, daily spend limit is not breached, and payload is untainted
allow {
    input.action == "execute_transaction"
    merchant_is_allowlisted
    spend_within_daily_limit
    payload_is_not_tainted
}

merchant_is_allowlisted {
    input.guardSettings.allowlist
    count(input.guardSettings.allowlist) > 0
    input.transaction.merchantId in input.guardSettings.allowlist
}

merchant_is_allowlisted {
    not input.guardSettings.allowlist
    input.transaction.merchantId in default_allowlisted_merchants
}

spend_within_daily_limit {
    projected_spend := input.currentDailySpendUcents + input.transaction.amountUcents
    projected_spend <= input.guardSettings.dailySpendLimitUcents
}

payload_is_not_tainted {
    input.taintStatus != "TAINTED"
}

# Explicit denial reasons for audit telemetry
deny_reason["UNAUTHORIZED_MERCHANT"] {
    input.action == "execute_transaction"
    not merchant_is_allowlisted
}

deny_reason["DAILY_LIMIT_EXCEEDED"] {
    input.action == "execute_transaction"
    not spend_within_daily_limit
}

deny_reason["TAINTED_PAYLOAD_HITL_REQUIRED"] {
    input.action == "execute_transaction"
    not payload_is_not_tainted
}
