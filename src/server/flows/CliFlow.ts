import { IPluginMiddleware } from "@verdaccio/types"
import { Application, Handler } from "express"
import qs from "query-string"

import {
  cliDeniedCallbackPath,
  cliErrorCallbackPath,
  cliPort,
  cliSuccessCallbackPath,
} from "../../constants"
import { logger } from "../../logger"
import { AuthCore } from "../plugin/AuthCore"
import { AuthProvider } from "../plugin/AuthProvider"
import { Verdaccio } from "../verdaccio"
import { WebFlow } from "./WebFlow"

const cliAuthorizeUrl = "/oauth/authorize"
const cliCallbackUrl = `http://localhost:${cliPort}`
const providerId = "cli"

const pluginAuthorizeUrl = WebFlow.getAuthorizePath(providerId)
const pluginCallbackeUrl = WebFlow.getCallbackPath(providerId)

export class CliFlow implements IPluginMiddleware<any> {
  constructor(
    private readonly verdaccio: Verdaccio,
    private readonly core: AuthCore,
    private readonly provider: AuthProvider,
  ) {}

  /**
   * IPluginMiddleware
   */
  register_middlewares(app: Application) {
    app.get(cliAuthorizeUrl, this.authorize)
    app.get(pluginCallbackeUrl, this.callback)
  }

  authorize: Handler = async (req, res) => {
    res.redirect(pluginAuthorizeUrl)
  }

  callback: Handler = async (req, res, next) => {
    let redirectUrl: string

    try {
      const code = await this.provider.getCode(req)
      const token = await this.provider.getToken(code)
      const username = await this.provider.getUsername(token)
      const groups = await this.provider.getGroups(token)

      if (this.core.authenticate(username, groups)) {
        const user = this.core.createAuthenticatedUser(username)
        const npmToken = await this.verdaccio.issueNpmToken(token, user)
        const params = qs.stringify({ token: npmToken })

        redirectUrl = cliCallbackUrl + cliSuccessCallbackPath + "?" + params
      } else {
        redirectUrl = cliCallbackUrl + cliDeniedCallbackPath
      }
    } catch (error) {
      logger.error(error)

      const params = qs.stringify({ message: error.message || error })

      redirectUrl = cliCallbackUrl + cliErrorCallbackPath + "?" + params
    }

    res.redirect(redirectUrl)
  }
}
