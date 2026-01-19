const PAID_EXCLUDED_STATUSES = ["CANCELLED", "UNPAID", "TO_RETURN"];
function paidOrderWhere() {
  return { orderStatus: { notIn: PAID_EXCLUDED_STATUSES, not: null } };
}
module.exports = { PAID_EXCLUDED_STATUSES, paidOrderWhere };
