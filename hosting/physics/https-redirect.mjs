export default {
  fetch(request) {
    const url = new URL(request.url)
    url.protocol = 'https:'
    return Response.redirect(url.href, 308)
  },
}
