const PAID_EXCLUDED_STATUSES = ["CANCELLED", "UNPAID", "TO_RETURN"];

function paidOrderWhere() {
  return {
    orderStatus: {
      not: null,
      notIn: PAID_EXCLUDED_STATUSES,
    },
  };
}

module.exports = { PAID_EXCLUDED_STATUSES, paidOrderWhere };
