/** Where the approval page sends the browser; a test replaces it, as jsdom cannot leave the page. */
export const browser = { go: (url: string) => window.location.assign(url) }
