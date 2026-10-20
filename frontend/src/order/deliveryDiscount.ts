import type { Site } from '../api/site'

/**
 * What a large order takes off its delivery fee: once the dishes reach `deliveryDiscountMinOrder` the fee drops by the base fee,
 * never below zero (the server's `DeliveryDiscount.Amount` decides it again for the order itself). The regular setting has one
 * fixed fee, which is the base fee.
 */
export function deliveryDiscount(site: Site | null, dishesTotal: number, fee: number): number {
  const minimum = site?.deliveryDiscountMinOrder
  if (!site || fee <= 0 || !minimum || dishesTotal < minimum) return 0
  const base = site.deliveryPricing === 'zones' ? site.deliveryBaseFee : (site.deliveryBaseFee ?? fee)
  return base && base > 0 ? Math.min(fee, base) : 0
}
