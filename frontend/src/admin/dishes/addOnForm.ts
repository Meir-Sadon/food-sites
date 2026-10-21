export interface GroupForm {
  key: number
  id: number | null
  name: string
  maxUnits: string
  /** The price of each unit above the limit; empty for a firm limit. */
  overLimitPrice: string
}

export interface AddOnForm {
  key: number
  dishId: number
  /** The key of its group in the form, or null. */
  groupKey: number | null
  price: string
  maxQuantity: string
  isCheckbox: boolean
  /** 0 for the first time the dish is offered, 1, 2... when it is offered again. */
  slot: number
  label: string
  showImage: boolean
  isDefault: boolean
  overLimitPrice: string
}

let nextKey = 1
export const formKey = () => nextKey++
