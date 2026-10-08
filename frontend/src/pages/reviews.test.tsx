import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Review, ReviewForm } from '../api/reviews'
import { publicApi, site } from '../test/catalogData'
import { fakeApi, invalid } from '../test/fakeApi'
import { renderAt } from '../test/render'

type Routes = Parameters<typeof fakeApi>[0]
const withReviews = { 'GET /api/site': () => site({ features: ['reviews'] }) }

const review = (id: number, patch: Partial<Review> = {}): Review => ({
  id,
  name: 'רון',
  rating: 5,
  comment: 'הכי טעים שאכלנו',
  images: [],
  submittedAt: '2026-10-05T10:00:00Z',
  ...patch,
})

const form = (patch: Partial<ReviewForm> = {}): ReviewForm => ({ name: 'דנה', submitted: false, images: [], ...patch })

describe('Reviews on the home page', () => {
  it('shows the approved reviews as cards with their stars, words and pictures', async () => {
    fakeApi({
      ...publicApi,
      ...withReviews,
      'GET /api/reviews': () => [review(1), review(2, { name: 'גל', rating: 4, images: ['https://images.test/a.jpg'] })],
    } as Routes)
    renderAt('/')

    const section = await screen.findByRole('region', { name: 'מה הלקוחות אומרים' })
    const cards = within(section).getAllByRole('listitem')
    expect(cards).toHaveLength(2)
    expect(within(cards[0]).getByRole('img', { name: '5 מתוך 5 כוכבים' })).toBeInTheDocument()
    expect(within(cards[0]).getByText('הכי טעים שאכלנו')).toBeInTheDocument()
    expect(within(cards[1]).getByRole('img', { name: 'תמונה 1 מאת גל' })).toHaveAttribute('src', 'https://images.test/a.jpg')
    expect(within(section).getByRole('button', { name: 'חוות הדעת הבאה' })).toBeInTheDocument()
  })

  it('shows nothing while there are no approved reviews', async () => {
    const api = fakeApi({ ...publicApi, ...withReviews, 'GET /api/reviews': () => [] } as Routes)
    renderAt('/')
    await waitFor(() => expect(api.sent('GET', '/api/reviews')).toHaveLength(1))
    expect(screen.queryByRole('region', { name: 'מה הלקוחות אומרים' })).not.toBeInTheDocument()
  })

  it('does not ask for reviews when the site has the feature off', async () => {
    const api = fakeApi({ ...publicApi, 'GET /api/site': () => site({ features: [] }) } as Routes)
    renderAt('/')
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    expect(api.sent('GET', '/api/reviews')).toHaveLength(0)
  })
})

describe('Review page', () => {
  const open = (routes: Routes) => {
    const api = fakeApi({ ...publicApi, ...withReviews, ...routes } as Routes)
    renderAt('/r/abcdefghij')
    return { api, user: userEvent.setup() }
  }

  it('sends the stars, words and name once', async () => {
    const { api, user } = open({
      'GET /api/reviews/abcdefghij': () => form(),
      'POST /api/reviews/abcdefghij': () => undefined,
    })
    expect(await screen.findByLabelText('השם שיופיע')).toHaveValue('דנה')

    await user.click(screen.getByRole('button', { name: 'שליחה' }))
    expect(screen.getByText('בחרו דירוג בין כוכב אחד לחמישה.')).toBeInTheDocument()
    expect(api.sent('POST', '/api/reviews/abcdefghij')).toHaveLength(0)

    await user.click(screen.getByRole('radio', { name: '4 מתוך 5 כוכבים' }))
    expect(screen.getByText('טעים מאוד')).toBeInTheDocument()
    await user.type(screen.getByLabelText('כמה מילים (לא חובה)'), ' היה מעולה ')
    await user.click(screen.getByRole('button', { name: 'שליחה' }))

    expect(await screen.findByText('תודה! קיבלנו את חוות הדעת שלך.')).toBeInTheDocument()
    expect(api.sent('POST', '/api/reviews/abcdefghij')[0].body).toEqual({ rating: 4, comment: 'היה מעולה', name: 'דנה' })
  })

  it('adds and removes pictures, up to two', async () => {
    const pictures = [
      { id: 1, url: 'https://images.test/1.jpg' },
      { id: 2, url: 'https://images.test/2.jpg' },
    ]
    const { api, user } = open({
      'GET /api/reviews/abcdefghij': () => form({ images: [pictures[0]] }),
      'POST /api/reviews/abcdefghij/images': () => form({ images: pictures }),
      'DELETE /api/reviews/abcdefghij/images/1': () => form({ images: [pictures[1]] }),
    })
    const input = (await screen.findByText('הוספת תמונה')).querySelector('input')!
    await user.upload(input, new File(['x'], 'a.jpg', { type: 'image/jpeg' }))

    expect(await screen.findByRole('img', { name: 'תמונה 2' })).toBeInTheDocument()
    expect(screen.queryByText('הוספת תמונה')).not.toBeInTheDocument()
    expect(api.sent('POST', '/api/reviews/abcdefghij/images')[0].body).toBeInstanceOf(FormData)

    await user.click(screen.getByRole('button', { name: 'הסרת תמונה 1' }))
    expect(await screen.findByText('הוספת תמונה')).toBeInTheDocument()
  })

  it('says so when the review was already sent or the link is wrong', async () => {
    open({ 'GET /api/reviews/abcdefghij': () => form({ submitted: true }) })
    expect(await screen.findByText('תודה! קיבלנו את חוות הדעת שלך.')).toBeInTheDocument()
  })

  it('explains a link that does not exist', async () => {
    open({ 'GET /api/reviews/abcdefghij': () => ({ status: 404, body: {} }) })
    expect(await screen.findByText(/הקישור לא תקין/)).toBeInTheDocument()
  })

  it('shows the server’s field errors', async () => {
    const { user } = open({
      'GET /api/reviews/abcdefghij': () => form(),
      'POST /api/reviews/abcdefghij': () => invalid({ Comment: ['tooLong'] }),
    })
    await user.click(await screen.findByRole('radio', { name: '5 מתוך 5 כוכבים' }))
    await user.click(screen.getByRole('button', { name: 'שליחה' }))
    expect(await screen.findByText('הטקסט ארוך מדי.')).toBeInTheDocument()
  })
})
