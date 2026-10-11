export interface GroupForm {
  key: number
  id: number | null
  name: string
  maxUnits: string
}

export interface AddOnForm {
  key: number
  dishId: number
  /** The key of its group in the form, or null. */
  groupKey: number | null
  price: string
  maxQuantity: string
  isCheckbox: boolean
}

let nextKey = 1
export const formKey = () => nextKey++
