/**
 * Export the raw content handler (koa middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @param {string} archiveFormat 'zip' or 'tar.gz'
 */
export default (options, archiveFormat) =>
  /**
   * Koa middleware handling GitHub API archive link requests
   * @see https://developer.github.com/v3/repos/contents/#get-archive-link
   * @param ctx
   */
  async ctx => {
    // GET /repos/:owner/:repo/:archive_format/:ref
    const { owner, repo: repoName, ref: refName = 'master' } = ctx.params

    const host = ctx.mappedSubDomain ? `localhost:${options.listen[ctx.protocol].port}` : ctx.host
    const location = `${ctx.protocol}://${host}/codeload/${owner}/${repoName}/${archiveFormat}/${refName}`

    ctx.redirect(location)
  };
