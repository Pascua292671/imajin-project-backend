export type TicketPricingInput = {
  unitPricePhp: number;
  quantity: number;
};

export type TicketPricingBreakdown = {
  unitPricePhp: number;
  quantity: number;
  subtotalPhp: number;
  serviceFeePhp: number;
  totalAmountPhp: number;
};

const FIXED_SERVICE_FEE_PHP = 5;

export function computeTicketPricing({
  unitPricePhp,
  quantity,
}: TicketPricingInput): TicketPricingBreakdown {
  const safeQty = Number.isInteger(quantity) && quantity > 0 ? quantity : 0;
  const safeUnitPrice =
    Number.isInteger(unitPricePhp) && unitPricePhp >= 0 ? unitPricePhp : 0;

  const subtotalPhp = safeUnitPrice * safeQty;
  const serviceFeePhp = safeQty > 0 ? FIXED_SERVICE_FEE_PHP : 0;
  const totalAmountPhp = subtotalPhp + serviceFeePhp;

  return {
    unitPricePhp: safeUnitPrice,
    quantity: safeQty,
    subtotalPhp,
    serviceFeePhp,
    totalAmountPhp,
  };
}