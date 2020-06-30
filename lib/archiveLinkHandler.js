/**
 * Export the raw content handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @param {string} archiveFormat 'zip' or 'tar.gz'
 * @returns {function(*, *, *)} handler function
 */
export default (options, archiveFormat) =>
  /**
   * Express middleware handling GitHub API archive link requests
   *
   * @param {Request} req Request object
   * @param {Response} res Response object
   * @param {callback} next next middleware in chain
   *
   * @see https://developer.github.com/v3/repos/contents/#get-archive-link
   */
  async ctx => {
    // GET /repos/:owner/:repo/:archive_format/:ref
    const { owner, repo: repoName, ref: refName = 'master' } = ctx.params

    const host = ctx.mappedSubDomain ? `localhost:${options.listen[ctx.protocol].port}` : ctx.host
    const location = `${ctx.protocol}://${host}/codeload/${owner}/${repoName}/${archiveFormat}/${refName}`

    ctx.redirect(location)
  };
