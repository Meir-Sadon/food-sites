import { apiJson, send } from './client'
import { queryString } from './operations'

export const MAX_REVIEW_IMAGES = 2
export const REVIEW_COMMENT_MAX_LENGTH = 1000
export const REVIEW_NAME_MAX_LENGTH = 40
export const TEMPLATE_NAME_MAX_LENGTH = 60
export const TEMPLATE_TEXT_MAX_LENGTH = 1000

/** An approved review, as the home page shows it. */
export interface Review {
  id: number
  name: string | null
  rating: number
  comment: string | null
  images: string[]
  submittedAt: string
}

export interface ReviewImage {
  id: number
  url: string
}

/** The review page behind a review link. */
export interface ReviewForm {
  /** The name the review starts with: the client's first name. */
  name: string | null
  submitted: boolean
  images: ReviewImage[]
}

export interface ReviewInput {
  rating: number
  comment: string
  name: string
}

export type ReviewStatus = 'Pending' | 'Approved' | 'Blocked'
export const reviewStatuses: ReviewStatus[] = ['Pending', 'Approved', 'Blocked']

export interface AdminReview {
  id: number
  orderId: number
  orderName: string
  phone: string
  name: string | null
  rating: number
  comment: string | null
  images: ReviewImage[]
  status: ReviewStatus
  submittedAt: string
}

export interface ReviewLink {
  token: string
  submitted: boolean
}

export interface MessageTemplate {
  id: number
  name: string
  text: string
  includeReviewLink: boolean
}

export type MessageTemplateInput = Omit<MessageTemplate, 'id'>

const reviews = '/api/reviews'

export const reviewsApi = {
  approved: () => apiJson<Review[]>(reviews),
  form: (token: string) => apiJson<ReviewForm>(`${reviews}/${encodeURIComponent(token)}`),
  addImage: (token: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiJson<ReviewForm>(`${reviews}/${encodeURIComponent(token)}/images`, { method: 'POST', body: form })
  },
  removeImage: (token: string, imageId: number) =>
    apiJson<ReviewForm>(`${reviews}/${encodeURIComponent(token)}/images/${imageId}`, send('DELETE')),
  submit: (token: string, input: ReviewInput) => apiJson<void>(`${reviews}/${encodeURIComponent(token)}`, send('POST', input)),
}

const adminReviews = '/api/admin/reviews'

export const reviewsAdminApi = {
  list: (status?: ReviewStatus | '') => apiJson<AdminReview[]>(`${adminReviews}${queryString({ status })}`),
  setStatus: (id: number, status: ReviewStatus) => apiJson<void>(`${adminReviews}/${id}/status`, send('PUT', { status })),
  linkFor: (orderId: number) => apiJson<ReviewLink>(`${adminReviews}/for-order/${orderId}`, send('POST')),
}

const templates = '/api/admin/message-templates'

export const templatesApi = {
  list: () => apiJson<MessageTemplate[]>(templates),
  create: (input: MessageTemplateInput) => apiJson<MessageTemplate>(templates, send('POST', input)),
  update: (id: number, input: MessageTemplateInput) => apiJson<MessageTemplate>(`${templates}/${id}`, send('PUT', input)),
  remove: (id: number) => apiJson<void>(`${templates}/${id}`, send('DELETE')),
}
