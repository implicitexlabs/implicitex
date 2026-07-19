/*
 * Generated from docs/product/coin-card state, fixture, and token contracts.
 * Do not edit by hand. Run: npm run build:coincard-review
 */
(function (root) {
  "use strict";
  var contract = {
  "generatedFrom": {
    "state": "docs/product/coin-card/coin-card.state.v1.json",
    "fixtures": "docs/product/coin-card/coin-card.fixtures.v1.json",
    "tokens": "docs/product/coin-card/coin-card.tokens.json"
  },
  "state": {
    "schema": "implicitex.coin-card.state.v1",
    "status": "draft-contract",
    "date": "2026-07-07",
    "authority": {
      "canonicalDirectory": "docs/product/coin-card",
      "proseContract": "docs/product/coin-card/COIN_CARD_INVARIANT_CONTRACT.md",
      "stateMatrix": "docs/product/coin-card/COIN_CARD_STATE_MATRIX.md",
      "artifact": "docs/product/coin-card/coin-card.artifact.json",
      "structure": "docs/product/coin-card/coin-card.structure/v1.json",
      "tokens": "docs/product/coin-card/coin-card.tokens.json"
    },
    "geometry": {
      "collapsed": {
        "outer": {
          "width": 216,
          "height": 44,
          "provenance": "CANONICAL"
        },
        "expandHitTarget": {
          "x": 0,
          "y": 0,
          "width": 216,
          "height": 44,
          "provenance": "CANONICAL"
        }
      },
      "expanded": {
        "outer": {
          "width": 460,
          "height": 286,
          "provenance": "CANONICAL"
        },
        "collapseControl": {
          "x": 420,
          "y": 20,
          "width": 20,
          "height": 20,
          "provenance": "PROPOSED"
        }
      }
    },
    "axes": {
      "view": [
        "COLLAPSED",
        "EXPANDED"
      ],
      "routeAvailability": [
        "UNAVAILABLE",
        "AVAILABLE"
      ],
      "routeValidity": [
        "UNKNOWN",
        "INVALID",
        "VALID"
      ],
      "routeMutability": [
        "EDITABLE",
        "LOCKED"
      ],
      "networkSupport": [
        "UNKNOWN",
        "SUPPORTED",
        "UNSUPPORTED"
      ],
      "tokenSupport": [
        "UNKNOWN",
        "SUPPORTED",
        "UNSUPPORTED"
      ],
      "amountText": [
        "EMPTY",
        "TEMPORARY_INCOMPLETE",
        "SYNTACTICALLY_COMPLETE",
        "SYNTAX_INVALID"
      ],
      "amountValidity": [
        "UNKNOWN",
        "VALID",
        "INVALID_CHARACTER",
        "EXCESS_PRECISION",
        "BELOW_MINIMUM",
        "ABOVE_MAXIMUM",
        "PRECISION_MISMATCH"
      ],
      "allowance": [
        "UNKNOWN",
        "APPROVAL_REQUIRED",
        "ALLOWANCE_SUFFICIENT"
      ],
      "retryability": [
        "UNKNOWN",
        "RETRYABLE",
        "NON_RETRYABLE"
      ],
      "funding": [
        "UNKNOWN",
        "SUFFICIENT",
        "INSUFFICIENT_USDC",
        "INSUFFICIENT_GAS"
      ],
      "wallet": [
        "DISCONNECTED",
        "CONNECTING",
        "CONNECTED_WRONG_NETWORK",
        "CONNECTED_READY",
        "CONNECTION_FAILED"
      ],
      "execution": [
        "IDLE",
        "PREVIEW_READY",
        "EXECUTION_READY",
        "APPROVAL_REQUESTED",
        "APPROVAL_PENDING",
        "APPROVAL_CONFIRMED",
        "TRANSFER_REQUESTED",
        "TRANSFER_PENDING",
        "CONFIRMED",
        "FAILED",
        "INTERRUPTED",
        "RECONCILING"
      ],
      "receipt": [
        "NONE",
        "LOCAL_READY",
        "SUBMITTED",
        "FINAL"
      ],
      "receiptOutcome": [
        "NONE",
        "success",
        "reverted",
        "not_broadcast",
        "no_execution_found",
        "unknown"
      ],
      "error": [
        "NONE",
        "ROUTE_ERROR",
        "FORM_ERROR",
        "FUNDING_ERROR",
        "WALLET_ERROR",
        "EXECUTION_ERROR",
        "RECONCILIATION_ERROR"
      ]
    },
    "productionParameters": {
      "network": {
        "value": "Polygon",
        "chainId": 137,
        "source": "app-web/deployments/polygon.json and app-web/frontend/public/config/chains.js",
        "provenance": "DEPLOYED_MAINNET"
      },
      "usdcDecimals": {
        "value": 6,
        "unit": "decimals",
        "source": "Circle native USDC on Polygon configuration",
        "network": "Polygon",
        "provenance": "PRODUCTION_CONFIG"
      },
      "tokenAddress": {
        "value": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        "unit": "evm-address",
        "source": "app-web/deployments/polygon.json and app-web/frontend/public/config/chains.js",
        "network": "Polygon",
        "provenance": "DEPLOYED_MAINNET"
      },
      "transferContractAddress": {
        "value": "0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0",
        "unit": "evm-address",
        "source": "app-web/deployments/polygon.json and app-web/frontend/public/config/chains.js",
        "network": "Polygon",
        "provenance": "DEPLOYED_MAINNET"
      },
      "feeBasisPoints": {
        "value": 100,
        "unit": "basis-points",
        "source": "app-web/deployments/polygon.json feeBps and ImplicitExTransfer feeBasisPoints",
        "network": "Polygon",
        "provenance": "DEPLOYED_MAINNET"
      },
      "minimumAmountUnits": {
        "value": "1000000",
        "unit": "usdc-base-units",
        "source": "app-web/deployments/polygon.json minTransfer; app-web/frontend/public/config/chains.js minTransferUsdc=1",
        "network": "Polygon",
        "provenance": "DEPLOYED_MAINNET"
      },
      "transferPrecisionUnits": {
        "value": "1000000",
        "unit": "usdc-base-units",
        "source": "app-web/deployments/polygon.json precision; ImplicitExTransfer transferPrecision",
        "network": "Polygon",
        "provenance": "DEPLOYED_MAINNET"
      }
    },
    "amountPolicy": {
      "inputType": "text",
      "inputMode": "decimal",
      "decimals": 6,
      "minimumAmountUnits": "1000000",
      "transferPrecisionUnits": "1000000",
      "maximumAmountUnits": null,
      "feeBasisPoints": 100,
      "unavailableDisplay": "—",
      "maximumTextLength": {
        "value": 32,
        "enabled": false,
        "provenance": "PROPOSED",
        "effect": "INVALID_CHARACTER if accepted"
      },
      "temporaryInputs": [
        "",
        ".",
        "1."
      ],
      "acceptedExamples": [
        "1",
        "1.0",
        "1.000000",
        "0001.00"
      ],
      "rejectedExamples": [
        "1 0",
        "1,000",
        "+1",
        "-1",
        "1e3",
        "1.0000001"
      ],
      "aboveMaximumRule": "Only produce ABOVE_MAXIMUM when maximumAmountUnits is not null."
    },
    "formattingExamples": [
      {
        "units": "0",
        "display": "0.00 USDC"
      },
      {
        "units": "1000000",
        "display": "1.00 USDC"
      },
      {
        "units": "1100000",
        "display": "1.10 USDC"
      },
      {
        "units": "1000001",
        "display": "1.000001 USDC"
      },
      {
        "units": "10010",
        "display": "0.01001 USDC"
      }
    ],
    "renderPrecedence": {
      "primaryStatus": [
        "CONFIRMED",
        "RECONCILING",
        "ACTIVE_EXECUTION",
        "EXECUTION_FAILURE",
        "ROUTE_FAILURE",
        "WALLET_NETWORK_BLOCKER",
        "FUNDING_BLOCKER",
        "AMOUNT_VALIDATION",
        "IDLE_OR_READY"
      ],
      "cta": [
        "COLLAPSED_EXPAND_ONLY",
        "CONFIRMED_NO_FUND_MOVING_ACTION",
        "PENDING_DISABLED",
        "RETRYABLE_FAILURE",
        "ROUTE_BLOCKER_DISABLED",
        "AMOUNT_BLOCKER_DISABLED",
        "NETWORK_TOKEN_BLOCKER_DISABLED",
        "CONNECT",
        "SWITCH_NETWORK",
        "FUNDING_BLOCKER_DISABLED",
        "APPROVE_OR_TRANSFER"
      ],
      "body": [
        "CONFIRMED_RESULT",
        "RECONCILIATION_FACTS",
        "ACTIVE_EXECUTION_FACTS",
        "FAILURE_FACTS",
        "ROUTE_ERROR",
        "FORM_VALIDATION_ERROR",
        "EDITABLE_FORM"
      ]
    },
    "bodySchemas": {
      "EDITABLE_FORM": [
        "recipient",
        "route",
        "destination",
        "amount",
        "fee",
        "total"
      ],
      "FORM_VALIDATION_ERROR": [
        "recipient",
        "validationTitle",
        "validationExplanation",
        "amount",
        "fee",
        "total"
      ],
      "APPROVAL_REQUESTED": [
        "recipient",
        "approvalHash",
        "result",
        "amount",
        "fee",
        "total"
      ],
      "APPROVAL_PENDING": [
        "recipient",
        "approvalHash",
        "result",
        "amount",
        "fee",
        "total"
      ],
      "APPROVAL_CONFIRMED": [
        "recipient",
        "approvalHash",
        "result",
        "amount",
        "fee",
        "total"
      ],
      "TRANSFER_REQUESTED": [
        "recipient",
        "transferHash",
        "result",
        "amount",
        "fee",
        "total"
      ],
      "TRANSFER_PENDING": [
        "recipient",
        "transferHash",
        "result",
        "amount",
        "fee",
        "total"
      ],
      "RECONCILIATION_FACTS": [
        "recipient",
        "result",
        "transferHash",
        "amount",
        "fee",
        "total"
      ],
      "CONFIRMED_RESULT": [
        "recipient",
        "result",
        "transferHash",
        "amount",
        "fee",
        "total"
      ],
      "FAILED": [
        "recipient",
        "result",
        "errorCode",
        "errorMessage",
        "amount",
        "receipt"
      ],
      "INTERRUPTED": [
        "recipient",
        "result",
        "errorCode",
        "errorMessage",
        "amount",
        "receipt"
      ],
      "ROUTE_ERROR": [
        "recipient",
        "result",
        "errorCode",
        "errorMessage",
        "route",
        "destination"
      ]
    },
    "selectorLabels": {
      "status": {
        "CONFIRMED": "Confirmed",
        "RECONCILING": "Checking chain",
        "TRANSFER_PENDING": "Confirming transfer",
        "TRANSFER_REQUESTED": "Confirm transfer",
        "APPROVAL_CONFIRMED": "Approval confirmed",
        "APPROVAL_PENDING": "Approval pending",
        "APPROVAL_REQUESTED": "Approve in wallet",
        "FAILED": "Failed",
        "INTERRUPTED": "Interrupted",
        "ROUTE_UNAVAILABLE": "Route unavailable",
        "ROUTE_INVALID": "Route invalid",
        "UNSUPPORTED_NETWORK": "Unsupported network",
        "UNSUPPORTED_TOKEN": "Unsupported token",
        "CONNECTION_FAILED": "Connection failed",
        "WRONG_NETWORK": "Wrong network",
        "INSUFFICIENT_USDC": "Insufficient USDC",
        "INSUFFICIENT_GAS": "Insufficient gas",
        "INVALID_AMOUNT": "Invalid amount",
        "EXCESS_PRECISION": "Too many decimals",
        "BELOW_MINIMUM": "Below minimum",
        "ABOVE_MAXIMUM": "Above maximum",
        "PRECISION_MISMATCH": "Whole USDC required",
        "TEMPORARY_AMOUNT": "Complete amount",
        "EXECUTION_READY": "Ready to send",
        "PREVIEW_READY": "Preview ready",
        "CONNECTING": "Connecting",
        "IDLE": "Enter amount"
      },
      "cta": {
        "EXPAND": "Expand",
        "RECEIPT": "Receipt",
        "PENDING": "Pending",
        "RETRY": "Retry",
        "ROUTE_UNAVAILABLE": "Route unavailable",
        "ROUTE_INVALID": "Route invalid",
        "UNSUPPORTED": "Unsupported",
        "ENTER_AMOUNT": "Enter amount",
        "FIX_AMOUNT": "Fix amount",
        "RECONNECT": "Reconnect",
        "CONNECT": "Connect",
        "CONNECTING": "Connecting",
        "SWITCH_NETWORK": "Switch network",
        "INSUFFICIENT_USDC": "Insufficient USDC",
        "INSUFFICIENT_GAS": "Insufficient gas",
        "CHECKING_FUNDS": "Checking funds",
        "APPROVE": "Approve",
        "SEND": "Send",
        "REVIEW_ERROR": "Review error",
        "INSPECT": "Inspect"
      }
    },
    "legalInvariants": [
      {
        "id": "axis-values-must-be-declared"
      },
      {
        "id": "route-availability-validity-consistency"
      },
      {
        "id": "amount-text-validity-consistency"
      },
      {
        "id": "above-maximum-requires-configured-maximum"
      },
      {
        "id": "fixture-amount-input-consistency"
      },
      {
        "id": "allowance-execution-consistency"
      },
      {
        "id": "funding-wallet-consistency"
      },
      {
        "id": "unsupported-network-token-cannot-be-execution-ready"
      },
      {
        "id": "preview-ready-requires-valid-route-and-amount",
        "when": {
          "execution": "PREVIEW_READY"
        },
        "requires": {
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID"
        }
      },
      {
        "id": "execution-ready-requires-funding-and-sender",
        "when": {
          "execution": "EXECUTION_READY"
        },
        "requires": {
          "wallet": "CONNECTED_READY",
          "funding": "SUFFICIENT",
          "allowance": "APPROVAL_REQUIRED|ALLOWANCE_SUFFICIENT",
          "activeIntentId": "present"
        }
      },
      {
        "id": "active-execution-requires-intent"
      },
      {
        "id": "approval-pending-requires-hash"
      },
      {
        "id": "approval-confirmed-requires-successful-approval"
      },
      {
        "id": "retryability-consistency"
      },
      {
        "id": "transfer-pending-requires-hash",
        "when": {
          "execution": "TRANSFER_PENDING"
        },
        "requires": {
          "values.transferHash": "present"
        }
      },
      {
        "id": "confirmed-requires-final-receipt",
        "when": {
          "execution": "CONFIRMED"
        },
        "requires": {
          "receipt": "FINAL",
          "receiptOutcome": "success"
        }
      },
      {
        "id": "receipt-finality-consistency"
      },
      {
        "id": "error-axis-consistency"
      },
      {
        "id": "fixture-math-consistency"
      }
    ],
    "transitionGuards": {
      "CONNECT": [
        "expanded-view",
        "no-active-wallet-request"
      ],
      "SWITCH_NETWORK": [
        "expanded-view",
        "connected-wrong-network"
      ],
      "REQUEST_APPROVAL": [
        "expanded-view",
        "valid-preview",
        "connected-ready-wallet",
        "sufficient-funding",
        "approval-required",
        "active-intent"
      ],
      "REQUEST_TRANSFER": [
        "expanded-view",
        "valid-preview",
        "connected-ready-wallet",
        "sufficient-funding",
        "allowance-sufficient",
        "active-intent"
      ],
      "RESET": [
        "new-intent",
        "preserve-view",
        "preserve-route",
        "clear-amounts",
        "reset-preflight"
      ],
      "NEW_TRANSACTION": [],
      "EXPAND": [
        "view-collapsed"
      ],
      "COLLAPSE": [
        "view-expanded"
      ],
      "RETRY": [
        "retryable-error",
        "same-intent-not-finalized"
      ]
    },
    "transitionPostconditions": {
      "RESET": [
        "preserve-view",
        "preserve-locked-route",
        "archive-evidence",
        "clear-amounts",
        "reset-preflight",
        "change-intent-id",
        "invalidate-old-events"
      ],
      "NEW_TRANSACTION": [
        "preserve-view",
        "preserve-locked-route",
        "archive-evidence",
        "clear-amounts",
        "reset-preflight",
        "change-intent-id",
        "invalidate-old-events"
      ],
      "RETRY": [
        "preserve-view",
        "preserve-locked-route",
        "archive-evidence",
        "preserve-transaction-facts",
        "reset-preflight",
        "change-attempt-id",
        "invalidate-old-events"
      ]
    },
    "coveragePolicy": {
      "axes": [
        "view",
        "routeAvailability",
        "routeValidity",
        "routeMutability",
        "networkSupport",
        "tokenSupport",
        "amountText",
        "amountValidity",
        "allowance",
        "retryability",
        "funding",
        "wallet",
        "execution",
        "receipt",
        "receiptOutcome",
        "error"
      ],
      "scenarios": [
        "collapsed-pending-execution",
        "post-broadcast-wallet-disconnection",
        "reset-new-intent",
        "current-intent-event-accepted",
        "stale-intent-rejected",
        "stale-archive-match",
        "stale-archive-miss",
        "retryable-failed",
        "non-retryable-failed",
        "retryable-interrupted",
        "non-retryable-interrupted"
      ]
    },
    "correlation": {
      "requiredEventField": "intentId",
      "staleEventPolicy": "Reject for active transaction; may reconcile archived receipt only by matching stored intent/hash."
    },
    "reset": {
      "createsNewIntentId": true,
      "invalidatesPriorIntentEvents": true,
      "clears": [
        "amountText",
        "amountUnits",
        "feeUnits",
        "totalUnits"
      ],
      "preserves": [
        "lockedRoute",
        "walletConnectionIfStillValid",
        "priorReceipts",
        "viewState"
      ],
      "mustRecheck": [
        "allowance",
        "balance",
        "gasReadiness",
        "network"
      ],
      "focusTarget": "amountInputWhenExpandedAndEditable"
    }
  },
  "fixtures": {
    "schema": "implicitex.coin-card.fixtures.v1",
    "status": "draft-fixtures",
    "date": "2026-07-07",
    "stateContract": "docs/product/coin-card/coin-card.state.v1.json",
    "fixtures": [
      {
        "id": "collapsed-acceptance-mark",
        "expectLegal": true,
        "state": {
          "view": "COLLAPSED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "EMPTY",
          "amountValidity": "UNKNOWN",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "IDLE",
          "receipt": "NONE",
          "error": "NONE",
          "activeIntentId": null,
          "activeAttemptId": "attempt-precision-mismatch-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "outer=216x44",
          "expand-only",
          "no-wallet-action"
        ],
        "values": {}
      },
      {
        "id": "expanded-empty-amount",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "EMPTY",
          "amountValidity": "UNKNOWN",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "IDLE",
          "receipt": "NONE",
          "error": "NONE",
          "activeIntentId": null,
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "outer=460x286",
          "fee=em-dash",
          "total=em-dash"
        ],
        "values": {}
      },
      {
        "id": "preview-ready-disconnected",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "PREVIEW_READY",
          "receipt": "LOCAL_READY",
          "error": "NONE",
          "activeIntentId": null,
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "amountUnits": "1000000",
          "feeUnits": "10000",
          "totalUnits": "1010000"
        },
        "assert": [
          "connect-cta",
          "no-approval",
          "amount=1.00 USDC",
          "fee=0.01 USDC",
          "total=1.01 USDC"
        ]
      },
      {
        "id": "execution-ready-connected",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "SUFFICIENT",
          "wallet": "CONNECTED_READY",
          "execution": "EXECUTION_READY",
          "receipt": "LOCAL_READY",
          "error": "NONE",
          "activeIntentId": "intent-ready-001",
          "allowance": "ALLOWANCE_SUFFICIENT",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "amountUnits": "1000000",
          "feeUnits": "10000",
          "totalUnits": "1010000",
          "sender": "0x1111111111111111111111111111111111111111"
        },
        "assert": [
          "approval-or-transfer-cta",
          "outer=460x286"
        ]
      },
      {
        "id": "route-unavailable-validity-unknown",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "UNAVAILABLE",
          "routeValidity": "UNKNOWN",
          "routeMutability": "LOCKED",
          "networkSupport": "UNKNOWN",
          "tokenSupport": "UNKNOWN",
          "amountText": "EMPTY",
          "amountValidity": "UNKNOWN",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "IDLE",
          "receipt": "NONE",
          "error": "ROUTE_ERROR",
          "activeIntentId": null,
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "route-unavailable-status"
        ],
        "values": {}
      },
      {
        "id": "collapsed-execution-ready-allowance-required",
        "expectLegal": true,
        "state": {
          "view": "COLLAPSED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "allowance": "ALLOWANCE_SUFFICIENT",
          "retryability": "UNKNOWN",
          "funding": "SUFFICIENT",
          "wallet": "CONNECTED_READY",
          "execution": "EXECUTION_READY",
          "receipt": "LOCAL_READY",
          "receiptOutcome": "NONE",
          "error": "NONE",
          "activeIntentId": "intent-collapsed-ready-001"
        },
        "values": {
          "amountUnits": "1000000",
          "feeUnits": "10000",
          "totalUnits": "1010000",
          "sender": "0x1111111111111111111111111111111111111111"
        },
        "assert": [
          "outer=216x44",
          "expand-only"
        ]
      },
      {
        "id": "execution-ready-approval-required",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "SUFFICIENT",
          "wallet": "CONNECTED_READY",
          "execution": "EXECUTION_READY",
          "receipt": "LOCAL_READY",
          "error": "NONE",
          "activeIntentId": "intent-approval-ready-001",
          "allowance": "APPROVAL_REQUIRED",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "amountUnits": "1000000",
          "feeUnits": "10000",
          "totalUnits": "1010000",
          "sender": "0x1111111111111111111111111111111111111111"
        },
        "assert": [
          "approve-cta",
          "outer=460x286"
        ]
      },
      {
        "id": "route-invalid-loaded",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "INVALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "IDLE",
          "receipt": "NONE",
          "error": "ROUTE_ERROR",
          "activeIntentId": null,
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "route-invalid-status"
        ],
        "values": {}
      },
      {
        "id": "amount-temporary-dot",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "TEMPORARY_INCOMPLETE",
          "amountValidity": "UNKNOWN",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "IDLE",
          "receipt": "NONE",
          "error": "NONE",
          "activeIntentId": null,
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "amountInput": "."
        },
        "assert": [
          "fix-amount-cta"
        ]
      },
      {
        "id": "amount-temporary-trailing-dot",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "TEMPORARY_INCOMPLETE",
          "amountValidity": "UNKNOWN",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "IDLE",
          "receipt": "NONE",
          "error": "NONE",
          "activeIntentId": null,
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "amountInput": "1."
        },
        "assert": [
          "fix-amount-cta"
        ]
      },
      {
        "id": "amount-excess-precision",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTAX_INVALID",
          "amountValidity": "EXCESS_PRECISION",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "IDLE",
          "receipt": "NONE",
          "error": "FORM_ERROR",
          "activeIntentId": null,
          "activeAttemptId": "attempt-precision-mismatch-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "amountInput": "1.0000001"
        },
        "assert": [
          "fix-amount-cta"
        ]
      },
      {
        "id": "amount-invalid-character",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "EDITABLE",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTAX_INVALID",
          "amountValidity": "INVALID_CHARACTER",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "IDLE",
          "receipt": "NONE",
          "error": "FORM_ERROR",
          "activeIntentId": null,
          "activeAttemptId": "attempt-precision-mismatch-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "amountInput": "1,000"
        },
        "assert": [
          "fix-amount-cta"
        ]
      },
      {
        "id": "amount-below-minimum",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "EDITABLE",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "BELOW_MINIMUM",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "IDLE",
          "receipt": "NONE",
          "error": "FORM_ERROR",
          "activeIntentId": null,
          "activeAttemptId": "attempt-precision-mismatch-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "amountInput": "0"
        },
        "assert": [
          "fix-amount-cta"
        ]
      },
      {
        "id": "amount-precision-mismatch",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "PRECISION_MISMATCH",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "IDLE",
          "receipt": "NONE",
          "error": "FORM_ERROR",
          "activeIntentId": null,
          "activeAttemptId": "attempt-precision-mismatch-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "amountInput": "1.5"
        },
        "assert": [
          "fix-amount-cta"
        ]
      },
      {
        "id": "confirmed-stale-precision-mismatch",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "PRECISION_MISMATCH",
          "funding": "UNKNOWN",
          "wallet": "CONNECTED_READY",
          "execution": "CONFIRMED",
          "receipt": "FINAL",
          "error": "NONE",
          "activeIntentId": "intent-confirmed-stale-precision-001",
          "allowance": "ALLOWANCE_SUFFICIENT",
          "receiptOutcome": "success",
          "retryability": "UNKNOWN"
        },
        "values": {
          "amountInput": "1.5",
          "amountUnits": "1500000",
          "feeUnits": "15000",
          "totalUnits": "1515000",
          "transferHash": "0xabababababababababababababababababababababababababababababababab"
        },
        "assert": [
          "confirmed-precedence"
        ]
      },
      {
        "id": "transfer-pending-route-unavailable",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "UNAVAILABLE",
          "routeValidity": "UNKNOWN",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "TRANSFER_PENDING",
          "receipt": "SUBMITTED",
          "error": "NONE",
          "activeIntentId": "intent-transfer-route-unavailable-001",
          "allowance": "ALLOWANCE_SUFFICIENT",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "transferHash": "0xbabababababababababababababababababababababababababababababababa"
        },
        "assert": [
          "pending-precedence"
        ]
      },
      {
        "id": "approval-pending-wallet-disconnected",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "APPROVAL_PENDING",
          "receipt": "SUBMITTED",
          "error": "NONE",
          "activeIntentId": "intent-approval-wallet-disconnected-001",
          "allowance": "APPROVAL_REQUIRED",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "approvalHash": "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        },
        "assert": [
          "approval-pending-status"
        ]
      },
      {
        "id": "failed-invalid-amount",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTAX_INVALID",
          "amountValidity": "INVALID_CHARACTER",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "FAILED",
          "receipt": "FINAL",
          "error": "EXECUTION_ERROR",
          "activeIntentId": "intent-failed-invalid-amount-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "reverted",
          "retryability": "NON_RETRYABLE"
        },
        "values": {
          "amountInput": "1 0",
          "errorCode": "INVALID_AMOUNT"
        },
        "assert": [
          "failed-retry-cta"
        ]
      },
      {
        "id": "funding-insufficient-usdc",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "INSUFFICIENT_USDC",
          "wallet": "CONNECTED_READY",
          "execution": "PREVIEW_READY",
          "receipt": "LOCAL_READY",
          "error": "FUNDING_ERROR",
          "activeIntentId": "intent-funding-usdc-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "amountUnits": "100000000",
          "feeUnits": "1000000",
          "totalUnits": "101000000"
        },
        "assert": [
          "insufficient-usdc-status"
        ]
      },
      {
        "id": "funding-insufficient-gas",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "INSUFFICIENT_GAS",
          "wallet": "CONNECTED_READY",
          "execution": "PREVIEW_READY",
          "receipt": "LOCAL_READY",
          "error": "FUNDING_ERROR",
          "activeIntentId": "intent-funding-gas-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "amountUnits": "1000000",
          "feeUnits": "10000",
          "totalUnits": "1010000"
        },
        "assert": [
          "insufficient-gas-status"
        ]
      },
      {
        "id": "approval-requested",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "SUFFICIENT",
          "wallet": "CONNECTED_READY",
          "execution": "APPROVAL_REQUESTED",
          "receipt": "LOCAL_READY",
          "error": "NONE",
          "activeIntentId": "intent-approval-requested-001",
          "allowance": "APPROVAL_REQUIRED",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "outer=460x286"
        ],
        "values": {}
      },
      {
        "id": "approval-pending",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "SUFFICIENT",
          "wallet": "CONNECTED_READY",
          "execution": "APPROVAL_PENDING",
          "receipt": "SUBMITTED",
          "error": "NONE",
          "activeIntentId": "intent-approval-pending-001",
          "allowance": "APPROVAL_REQUIRED",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "approvalHash": "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        },
        "assert": [
          "approval-pending-status"
        ]
      },
      {
        "id": "collapsed-approval-pending",
        "expectLegal": true,
        "state": {
          "view": "COLLAPSED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "APPROVAL_PENDING",
          "receipt": "SUBMITTED",
          "error": "NONE",
          "activeIntentId": "intent-collapsed-approval-001",
          "allowance": "APPROVAL_REQUIRED",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "approvalHash": "0xcacacacacacacacacacacacacacacacacacacacacacacacacacacacacacacaca"
        },
        "assert": [
          "collapsed-pending-legal",
          "outer=216x44"
        ]
      },
      {
        "id": "approval-confirmed",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "SUFFICIENT",
          "wallet": "CONNECTED_READY",
          "execution": "APPROVAL_CONFIRMED",
          "receipt": "SUBMITTED",
          "error": "NONE",
          "activeIntentId": "intent-approval-confirmed-001",
          "allowance": "APPROVAL_REQUIRED",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "approvalHash": "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          "approvalReceiptStatus": "success"
        },
        "assert": [
          "approval-confirmed-status"
        ]
      },
      {
        "id": "transfer-requested",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "SUFFICIENT",
          "wallet": "CONNECTED_READY",
          "execution": "TRANSFER_REQUESTED",
          "receipt": "LOCAL_READY",
          "error": "NONE",
          "activeIntentId": "intent-transfer-requested-001",
          "allowance": "ALLOWANCE_SUFFICIENT",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "transfer-requested-status"
        ],
        "values": {}
      },
      {
        "id": "transfer-pending-long-hash",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "SUFFICIENT",
          "wallet": "CONNECTED_READY",
          "execution": "TRANSFER_PENDING",
          "receipt": "SUBMITTED",
          "error": "NONE",
          "activeIntentId": "intent-transfer-001",
          "allowance": "ALLOWANCE_SUFFICIENT",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "recipient": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          "transferHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "assert": [
          "hash-middle-truncated",
          "pending-precedence"
        ]
      },
      {
        "id": "collapsed-transfer-pending",
        "expectLegal": true,
        "state": {
          "view": "COLLAPSED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "TRANSFER_PENDING",
          "receipt": "SUBMITTED",
          "error": "NONE",
          "activeIntentId": "intent-collapsed-transfer-001",
          "allowance": "ALLOWANCE_SUFFICIENT",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "transferHash": "0xfafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafa"
        },
        "assert": [
          "collapsed-pending-legal",
          "outer=216x44"
        ]
      },
      {
        "id": "transfer-pending-wallet-disconnected",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "TRANSFER_PENDING",
          "receipt": "SUBMITTED",
          "error": "NONE",
          "activeIntentId": "intent-transfer-disconnected-001",
          "allowance": "ALLOWANCE_SUFFICIENT",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "transferHash": "0xfefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefe"
        },
        "assert": [
          "post-broadcast-disconnect-legal",
          "pending-precedence"
        ]
      },
      {
        "id": "failed-retryable",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "FAILED",
          "receipt": "NONE",
          "error": "EXECUTION_ERROR",
          "activeIntentId": "intent-failed-001",
          "activeAttemptId": "attempt-failed-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "RETRYABLE"
        },
        "values": {
          "recipient": "0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919",
          "route": "Route valid",
          "destination": "Polygon USDC",
          "amountUnits": "1000000",
          "feeUnits": "10000",
          "totalUnits": "1010000",
          "approvalHash": "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
          "retryable": true,
          "errorCode": "USER_REJECTED"
        },
        "assert": [
          "failed-retry-cta"
        ]
      },
      {
        "id": "interrupted-retryable",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "INTERRUPTED",
          "receipt": "NONE",
          "error": "EXECUTION_ERROR",
          "activeIntentId": "intent-interrupted-001",
          "activeAttemptId": "attempt-interrupted-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "RETRYABLE"
        },
        "values": {
          "retryable": true,
          "errorCode": "NETWORK_INTERRUPTED"
        },
        "assert": [
          "interrupted-retry-cta"
        ]
      },
      {
        "id": "reconciling",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "RECONCILING",
          "receipt": "SUBMITTED",
          "error": "RECONCILIATION_ERROR",
          "activeIntentId": "intent-reconciling-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "unknown",
          "retryability": "UNKNOWN"
        },
        "values": {
          "transferHash": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        },
        "assert": [
          "reconciling-precedence"
        ]
      },
      {
        "id": "failed-final-evidence",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "FAILED",
          "receipt": "FINAL",
          "error": "EXECUTION_ERROR",
          "activeIntentId": "intent-failed-final-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "reverted",
          "retryability": "NON_RETRYABLE"
        },
        "values": {
          "transferHash": "0xefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef"
        },
        "assert": [
          "failed-retry-cta"
        ]
      },
      {
        "id": "interrupted-final-not-broadcast",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "INTERRUPTED",
          "receipt": "FINAL",
          "error": "EXECUTION_ERROR",
          "activeIntentId": "intent-interrupted-final-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "not_broadcast",
          "retryability": "NON_RETRYABLE"
        },
        "values": {},
        "assert": [
          "interrupted-retry-cta"
        ]
      },
      {
        "id": "interrupted-final-no-execution-found",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "INTERRUPTED",
          "receipt": "FINAL",
          "error": "RECONCILIATION_ERROR",
          "activeIntentId": "intent-no-execution-found-001",
          "activeAttemptId": "attempt-no-execution-found-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "no_execution_found",
          "retryability": "NON_RETRYABLE"
        },
        "values": {},
        "assert": [
          "interrupted-retry-cta"
        ]
      },
      {
        "id": "receipt-none-none",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "IDLE",
          "receipt": "NONE",
          "error": "NONE",
          "activeIntentId": null,
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "amountUnits": "1000000",
          "feeUnits": "10000",
          "totalUnits": "1010000"
        },
        "assert": [
          "outer=460x286"
        ]
      },
      {
        "id": "receipt-local-ready-none",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "PREVIEW_READY",
          "receipt": "LOCAL_READY",
          "error": "NONE",
          "activeIntentId": null,
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "values": {
          "amountUnits": "1000000",
          "feeUnits": "10000",
          "totalUnits": "1010000"
        },
        "assert": [
          "outer=460x286"
        ]
      },
      {
        "id": "receipt-submitted-unknown",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "RECONCILING",
          "receipt": "SUBMITTED",
          "error": "RECONCILIATION_ERROR",
          "activeIntentId": "intent-receipt-submitted-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "unknown",
          "retryability": "UNKNOWN"
        },
        "values": {
          "transferHash": "0xabababababababababababababababababababababababababababababababab"
        },
        "assert": [
          "reconciling-precedence"
        ]
      },
      {
        "id": "receipt-none-success-illegal",
        "expectLegal": false,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "IDLE",
          "receipt": "NONE",
          "error": "NONE",
          "activeIntentId": null,
          "allowance": "UNKNOWN",
          "receiptOutcome": "success",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "reject-illegal-vector"
        ],
        "values": {}
      },
      {
        "id": "receipt-local-ready-reverted-illegal",
        "expectLegal": false,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "PREVIEW_READY",
          "receipt": "LOCAL_READY",
          "error": "NONE",
          "activeIntentId": null,
          "allowance": "UNKNOWN",
          "receiptOutcome": "reverted",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "reject-illegal-vector"
        ],
        "values": {}
      },
      {
        "id": "receipt-submitted-success-illegal",
        "expectLegal": false,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "RECONCILING",
          "receipt": "SUBMITTED",
          "error": "RECONCILIATION_ERROR",
          "activeIntentId": "intent-submitted-success-illegal",
          "allowance": "UNKNOWN",
          "receiptOutcome": "success",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "reject-illegal-vector"
        ],
        "values": {}
      },
      {
        "id": "receipt-final-unknown-illegal",
        "expectLegal": false,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "IDLE",
          "receipt": "FINAL",
          "error": "NONE",
          "activeIntentId": null,
          "allowance": "UNKNOWN",
          "receiptOutcome": "unknown",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "reject-illegal-vector"
        ],
        "values": {}
      },
      {
        "id": "failed-not-broadcast-illegal",
        "expectLegal": false,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "FAILED",
          "receipt": "FINAL",
          "error": "EXECUTION_ERROR",
          "activeIntentId": "intent-failed-not-broadcast-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "not_broadcast",
          "retryability": "NON_RETRYABLE"
        },
        "assert": [
          "reject-illegal-vector"
        ],
        "values": {}
      },
      {
        "id": "interrupted-reverted-illegal",
        "expectLegal": false,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "INTERRUPTED",
          "receipt": "FINAL",
          "error": "EXECUTION_ERROR",
          "activeIntentId": "intent-interrupted-reverted-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "reverted",
          "retryability": "NON_RETRYABLE"
        },
        "assert": [
          "reject-illegal-vector"
        ],
        "values": {}
      },
      {
        "id": "reconciling-success-illegal",
        "expectLegal": false,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "RECONCILING",
          "receipt": "FINAL",
          "error": "RECONCILIATION_ERROR",
          "activeIntentId": "intent-reconciling-success-001",
          "allowance": "UNKNOWN",
          "receiptOutcome": "success",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "reject-illegal-vector"
        ],
        "values": {}
      },
      {
        "id": "unsupported-network",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "UNSUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "CONNECTED_WRONG_NETWORK",
          "execution": "IDLE",
          "receipt": "NONE",
          "error": "WALLET_ERROR",
          "activeIntentId": null,
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "unsupported-network-status"
        ],
        "values": {}
      },
      {
        "id": "wallet-connecting",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "CONNECTING",
          "execution": "PREVIEW_READY",
          "receipt": "LOCAL_READY",
          "error": "NONE",
          "activeIntentId": null,
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "outer=460x286"
        ],
        "values": {}
      },
      {
        "id": "unsupported-token",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "UNSUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "CONNECTED_READY",
          "execution": "IDLE",
          "receipt": "NONE",
          "error": "WALLET_ERROR",
          "activeIntentId": null,
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "unsupported-token-status"
        ],
        "values": {}
      },
      {
        "id": "connection-failed",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "CONNECTION_FAILED",
          "execution": "PREVIEW_READY",
          "receipt": "LOCAL_READY",
          "error": "WALLET_ERROR",
          "activeIntentId": null,
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "connection-failed-status"
        ],
        "values": {}
      },
      {
        "id": "confirmed-final",
        "expectLegal": true,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "CONFIRMED",
          "receipt": "FINAL",
          "error": "NONE",
          "activeIntentId": "intent-final-001",
          "allowance": "ALLOWANCE_SUFFICIENT",
          "receiptOutcome": "success",
          "retryability": "UNKNOWN"
        },
        "values": {
          "transferHash": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        },
        "assert": [
          "confirmed-precedence",
          "no-fund-moving-cta"
        ]
      },
      {
        "id": "collapsed-execution-ready",
        "expectLegal": true,
        "state": {
          "view": "COLLAPSED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "SUFFICIENT",
          "wallet": "CONNECTED_READY",
          "execution": "EXECUTION_READY",
          "receipt": "LOCAL_READY",
          "error": "NONE",
          "activeIntentId": "intent-illegal-001",
          "allowance": "APPROVAL_REQUIRED",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "collapsed-pending-legal",
          "outer=216x44"
        ],
        "values": {}
      },
      {
        "id": "illegal-enum-value",
        "expectLegal": false,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "MISSING",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "UNKNOWN",
          "wallet": "DISCONNECTED",
          "execution": "PREVIEW_READY",
          "receipt": "LOCAL_READY",
          "error": "NONE",
          "activeIntentId": null,
          "allowance": "UNKNOWN",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "reject-invalid-enum"
        ],
        "values": {}
      },
      {
        "id": "illegal-missing-required-transfer-hash",
        "expectLegal": false,
        "state": {
          "view": "EXPANDED",
          "routeAvailability": "AVAILABLE",
          "routeValidity": "VALID",
          "routeMutability": "LOCKED",
          "networkSupport": "SUPPORTED",
          "tokenSupport": "SUPPORTED",
          "amountText": "SYNTACTICALLY_COMPLETE",
          "amountValidity": "VALID",
          "funding": "SUFFICIENT",
          "wallet": "CONNECTED_READY",
          "execution": "TRANSFER_PENDING",
          "receipt": "SUBMITTED",
          "error": "NONE",
          "activeIntentId": "intent-missing-transfer-hash-001",
          "allowance": "ALLOWANCE_SUFFICIENT",
          "receiptOutcome": "NONE",
          "retryability": "UNKNOWN"
        },
        "assert": [
          "reject-missing-required"
        ],
        "values": {}
      },
      {
        "id": "stale-intent-event",
        "expectRejected": true,
        "event": {
          "type": "TRANSFER_RECEIPT_CONFIRMED",
          "intentId": "intent-old",
          "attemptId": "attempt-old-001",
          "activeIntentId": "intent-new",
          "activeAttemptId": "attempt-new-001"
        },
        "assert": [
          "reject-active-mutation",
          "archive-reconcile-only-if-matching-receipt",
          "new-intent-required"
        ]
      },
      {
        "id": "current-intent-event",
        "expectAccepted": true,
        "event": {
          "type": "TRANSFER_RECEIPT_CONFIRMED",
          "intentId": "intent-current",
          "attemptId": "attempt-current-001",
          "activeIntentId": "intent-current",
          "activeAttemptId": "attempt-current-001"
        },
        "assert": [
          "accepted-current-intent"
        ]
      },
      {
        "id": "current-intent-stale-attempt-event",
        "expectRejected": true,
        "event": {
          "type": "TRANSFER_RECEIPT_CONFIRMED",
          "intentId": "intent-current",
          "attemptId": "attempt-stale-001",
          "activeIntentId": "intent-current",
          "activeAttemptId": "attempt-current-001"
        },
        "assert": [
          "reject-stale-attempt"
        ]
      },
      {
        "id": "stale-archive-match",
        "expectAccepted": true,
        "event": {
          "type": "TRANSFER_RECEIPT_CONFIRMED",
          "intentId": "intent-archived",
          "attemptId": "attempt-archived-001",
          "activeIntentId": "intent-current",
          "activeAttemptId": "attempt-current-001",
          "archiveReceiptIntentId": "intent-archived",
          "archiveReceiptAttemptId": "attempt-archived-001"
        },
        "assert": [
          "archive-match"
        ]
      },
      {
        "id": "stale-archive-miss",
        "expectRejected": true,
        "event": {
          "type": "TRANSFER_RECEIPT_CONFIRMED",
          "intentId": "intent-lost",
          "attemptId": "attempt-lost-001",
          "activeIntentId": "intent-current",
          "activeAttemptId": "attempt-current-001",
          "archiveReceiptIntentId": "intent-archived",
          "archiveReceiptAttemptId": "attempt-archived-001"
        },
        "assert": [
          "archive-miss"
        ]
      },
      {
        "id": "archived-attempt-mismatch",
        "expectRejected": true,
        "event": {
          "type": "TRANSFER_RECEIPT_CONFIRMED",
          "intentId": "intent-archived",
          "attemptId": "attempt-wrong-001",
          "activeIntentId": "intent-current",
          "activeAttemptId": "attempt-current-001",
          "archiveReceiptIntentId": "intent-archived",
          "archiveReceiptAttemptId": "attempt-archived-001"
        },
        "assert": [
          "archive-attempt-mismatch"
        ]
      },
      {
        "id": "delayed-old-approval-after-retry",
        "expectRejected": true,
        "event": {
          "type": "APPROVAL_CONFIRMED",
          "intentId": "intent-retry-001",
          "attemptId": "attempt-retry-old",
          "activeIntentId": "intent-retry-001",
          "activeAttemptId": "attempt-retry-new"
        },
        "assert": [
          "reject-stale-attempt"
        ]
      },
      {
        "id": "delayed-old-transfer-after-retry",
        "expectRejected": true,
        "event": {
          "type": "TRANSFER_RECEIPT_CONFIRMED",
          "intentId": "intent-retry-001",
          "attemptId": "attempt-retry-old",
          "activeIntentId": "intent-retry-001",
          "activeAttemptId": "attempt-retry-new"
        },
        "assert": [
          "reject-stale-attempt"
        ]
      },
      {
        "id": "reset-new-intent",
        "expectRejected": true,
        "event": {
          "type": "RESET_STALE_RECEIPT",
          "intentId": "intent-before-reset",
          "attemptId": "attempt-before-reset",
          "activeIntentId": "intent-after-reset",
          "activeAttemptId": "attempt-after-reset"
        },
        "assert": [
          "new-intent-required"
        ]
      }
    ],
    "requiredFutureFixtures": []
  },
  "tokens": {
    "name": "implicitex.coin-card.tokens.v1",
    "schemaVersion": "coin-card.tokens.v1",
    "status": "normative",
    "date": "2026-07-02",
    "units": "css_px",
    "boxSizing": "border-box",
    "tolerance": {
      "token": 0,
      "renderedCssPx": 0.5
    },
    "constants": {
      "expanded": {
        "radius": 12,
        "border": 1,
        "inset": 20,
        "dividerWidth": 1,
        "lettermarkValueShift": {
          "duration": 8,
          "easing": "ease-in-out",
          "neutralColor": "rgb(112, 112, 112)",
          "brightColor": "rgb(242, 244, 246)",
          "phaseOffset": 0
        }
      },
      "collapsed": {
        "dividerWidth": 1,
        "lettermarkValueShift": {
          "duration": 9,
          "easing": "ease-in-out",
          "neutralColor": "rgb(112, 112, 112)",
          "brightColor": "rgb(242, 244, 246)",
          "phaseOffset": -1.8
        }
      }
    },
    "assets": {
      "lettermark": {
        "path": "app-web/frontend/public/components/images/lettermark-white.svg",
        "sha256": "0a307891baa5fbf519e178b962c2a91b00d3d8c009b1f29a04544bb90c83c3c1",
        "viewBox": [
          0,
          0,
          25,
          25
        ],
        "aspectRatio": 1,
        "preserveAspectRatio": "xMidYMid meet",
        "allowedScaleRatio": 1
      },
      "implicitexWordmark": {
        "path": "app-web/frontend/public/components/images/wordmark-white.svg",
        "sha256": "685f972e54c3241b1ba4e1411ab6e897e1469146991564939fa4bb0f1afe3fdf",
        "viewBox": [
          0,
          0,
          201.89,
          14.7
        ],
        "role": "canonical-brand-wordmark"
      },
      "coinCardWordmark": {
        "path": "app-web/frontend/public/components/images/coincard-logo.svg",
        "sha256": "82eb9310f77fb921d1e8c216afcfc473482a4e3b27f61a54c968538b7e8b50c3",
        "viewBox": [
          0,
          0,
          392,
          56
        ],
        "role": "canonical-product-wordmark"
      }
    },
    "formFactors": {
      "collapsedAcceptanceMark": {
        "outer": {
          "width": 216,
          "height": 44
        },
        "grid": {
          "identityArea": {
            "x": 0,
            "y": 0,
            "width": 172,
            "height": 44
          },
          "lettermarkCell": {
            "x": 172,
            "y": 0,
            "width": 44,
            "height": 44
          }
        },
        "slots": {
          "primaryClaim": {
            "x": 12,
            "y": 7,
            "width": 128,
            "height": 14,
            "baseline": 18
          },
          "networkToken": {
            "x": 12,
            "y": 25,
            "width": 92,
            "height": 10,
            "baseline": 33
          },
          "attribution": {
            "x": 12,
            "y": 25,
            "width": 148,
            "height": 10,
            "baseline": 33
          },
          "attributionFit": {
            "poweredByWidth": 58,
            "gap": 4,
            "wordmarkHeight": 6,
            "wordmarkAspectRatio": 13.7340136,
            "wordmarkWidth": 82.4040816,
            "totalWidth": 144.4040816
          },
          "statusIndicator": {
            "x": 148,
            "y": 18,
            "diameter": 6
          },
          "lettermarkCellDivider": {
            "x1": 172,
            "y1": 8,
            "x2": 172,
            "y2": 36
          },
          "coinCardWordmarkFit": {
            "maxWidth": 128,
            "maxHeight": 12,
            "renderedWidth": 84,
            "renderedHeight": 12,
            "aspectRatio": 7,
            "objectFit": "contain",
            "objectPosition": "left center"
          }
        },
        "lettermark": {
          "box": {
            "width": 36,
            "height": 36
          },
          "cell": {
            "width": 44,
            "height": 44
          },
          "clearSpace": 4,
          "position": {
            "x": 176,
            "y": 4
          }
        }
      },
      "expandedHorizontal": {
        "outer": {
          "width": 460,
          "height": 286
        },
        "planes": {
          "identityHeader": {
            "x": 0,
            "y": 0,
            "width": 460,
            "height": 136
          },
          "credential": {
            "x": 0,
            "y": 136,
            "width": 460,
            "height": 108
          },
          "action": {
            "x": 0,
            "y": 244,
            "width": 460,
            "height": 42
          }
        },
        "slots": {
          "identityHeader": {
            "primaryClaim": {
              "x": 20,
              "y": 20,
              "width": 300,
              "height": 20,
              "baseline": 35
            },
            "recipientName": {
              "x": 20,
              "y": 46,
              "width": 300,
              "height": 16,
              "baseline": 58
            },
            "networkToken": {
              "x": 20,
              "y": 67,
              "width": 140,
              "height": 12,
              "baseline": 76
            },
            "productIdentity": {
              "x": 20,
              "y": 94,
              "width": 140,
              "height": 12
            },
            "productIdentityFit": {
              "maxWidth": 140,
              "maxHeight": 12,
              "renderedWidth": 84,
              "renderedHeight": 12,
              "aspectRatio": 7,
              "objectFit": "contain",
              "objectPosition": "left center"
            },
            "attribution": {
              "x": 20,
              "y": 111,
              "width": 180,
              "height": 10,
              "baseline": 119
            },
            "headerDivider": {
              "x1": 20,
              "y1": 135,
              "x2": 440,
              "y2": 135
            }
          },
          "credential": {
            "rowHeight": 18,
            "labelX": 20,
            "labelWidth": 120,
            "valueRightEdge": 440,
            "valueMaxWidth": 260,
            "rows": [
              {
                "id": "recipient",
                "y": 136,
                "baseline": 148
              },
              {
                "id": "route",
                "y": 154,
                "baseline": 166
              },
              {
                "id": "destination",
                "y": 172,
                "baseline": 184
              },
              {
                "id": "amount",
                "y": 190,
                "baseline": 202
              },
              {
                "id": "fee",
                "y": 208,
                "baseline": 220
              },
              {
                "id": "total",
                "y": 226,
                "baseline": 238
              }
            ],
            "credentialDivider": {
              "x1": 20,
              "y1": 244,
              "x2": 440,
              "y2": 244
            }
          },
          "action": {
            "statusIndicator": {
              "x": 20,
              "y": 260,
              "diameter": 6
            },
            "statusText": {
              "x": 34,
              "y": 255,
              "width": 210,
              "height": 14,
              "baseline": 266
            },
            "cta": {
              "x": 302,
              "y": 254,
              "width": 138,
              "height": 22
            },
            "ctaLabel": {
              "x": 318,
              "y": 259,
              "width": 106,
              "height": 12,
              "baseline": 268
            }
          }
        },
        "inset": {
          "x": 20,
          "y": 20
        },
        "border": {
          "width": 1
        },
        "radius": 12,
        "lettermark": {
          "box": {
            "width": 40,
            "height": 40
          },
          "position": {
            "x": 400,
            "y": 20
          },
          "clearSpaceFromRight": 20,
          "clearSpaceFromTop": 20
        }
      }
    },
    "typography": {
      "primaryClaim": {
        "family": "Oxanium",
        "weight": 600,
        "size": 18,
        "lineHeight": 1.1
      },
      "recipientName": {
        "family": "Oxanium",
        "weight": 500,
        "size": 13,
        "lineHeight": 1.15
      },
      "micro": {
        "family": "IBM Plex Mono",
        "weight": 500,
        "size": 9,
        "letterSpacingEm": 0.09
      },
      "attribution": {
        "family": "IBM Plex Mono",
        "weight": 500,
        "size": 8,
        "letterSpacingEm": 0.08
      }
    },
    "overflow": {
      "recipientName": "single-line-ellipsis",
      "address": "middle-truncate-6-4",
      "networkToken": "controlled-enum",
      "status": "controlled-enum",
      "error": "controlled-code-and-short-copy"
    },
    "ratios": {
      "expanded": {
        "lettermarkWidthToCardWidth": 0.0869565,
        "lettermarkHeightToCardHeight": 0.1398601,
        "topInsetToWidth": 0.0434783,
        "topInsetToHeight": 0.0699301,
        "ctaWidthToCardWidth": 0.3,
        "ctaHeightToCardHeight": 0.0769231,
        "headerPlaneToCardHeight": 0.4755245,
        "credentialPlaneToCardHeight": 0.3776224,
        "actionPlaneToCardHeight": 0.1468531
      }
    }
  }
};
  if (typeof module !== "undefined" && module.exports) module.exports = contract;
  root.COIN_CARD_REVIEW_CONTRACT = contract;
})(typeof window !== "undefined" ? window : globalThis);
