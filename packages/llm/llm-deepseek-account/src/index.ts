/** Account-token authentication, the account model listing, and version gating for the DeepSeek account route. */
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type { Context } from '@deepseek-ai/cordis'
import { ACCOUNT_PLAN_REQUIRED_CODE, ACCOUNT_QUOTA_EXCEEDED_CODE, APP_IDENTITY, LlmError, PLAN_REQUIRED_CODE, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import {
  catalogModelInfo, createModelListingCache, refuseListedModel, registerDeepSeekProvider, requestModelListing, resolveAdapterOptions,
  resolveListedCatalog, rejectDeepSeekAccountToken, resolveDeepSeekAccountToken,
} from '@deepseek-ai/dsh-llm-deepseek'
import type { DeepSeekRequestAuth, ListedCatalog, ListingView, ModelListing, ResolvedDeepSeekOptions } from '@deepseek-ai/dsh-llm-deepseek'
import { Config, plainAccountOptions, resolveAccountOptions } from './config.ts'

export { Config, plainAccountOptions, resolveAccountOptions } from './config.ts'
export const name = 'llm-deepseek-account'
export const inject = ['llm']

const PROVIDER = 'deepseek-account'
/** Header carrying the account token on Messages, Files, and model-listing requests. */
const TOKEN_HEADER = 'x-dsh-auth-token'
/** Console tag of listing diagnostics; product profiles mount no console exporter for `ctx.logger`. */
const LOG_TAG = '[llm-deepseek-account]'

/** Connection facts of one account operation: protocol settings plus the catalog resolved with them. */
interface AccountConnection extends ResolvedDeepSeekOptions {
  readonly catalog: ListedCatalog
}

export function apply(ctx: Context, config: Config): void {
  const environment = launchEnvironmentOf(ctx)
  const settings = () => resolveAccountOptions(plainAccountOptions(config), environment)
  settings()
  const supported = resolveAdapterOptions({}).models
  const resolveAuth = async (connection: ResolvedDeepSeekOptions): Promise<DeepSeekRequestAuth> => {
    const token = await resolveDeepSeekAccountToken(ctx, connection.baseURL)
    if (token === undefined) throw new LlmError('Sign in to Fiwen to use the account provider. The request destination must allow account authentication.', 'ACCOUNT_SIGN_IN_REQUIRED')
    return {
      headers: { [TOKEN_HEADER]: token },
      onRequestError: async (error) => {
        if (!(error instanceof LlmError)) return error
        if (error.code === QUOTA_EXCEEDED_CODE) {
          return new LlmError(error.message, ACCOUNT_QUOTA_EXCEEDED_CODE, { ...error.failure, cause: error })
        }
        if (error.code === PLAN_REQUIRED_CODE) {
          return new LlmError(error.message, ACCOUNT_PLAN_REQUIRED_CODE, { ...error.failure, cause: error })
        }
        if (error.failure.status !== 401) return error
        const rejected = new LlmError(error.message, 'ACCOUNT_TOKEN_INVALID', { ...error.failure, cause: error })
        await rejectDeepSeekAccountToken(ctx, token)
        return rejected
      },
    }
  }
  const catalog = createModelListingCache(ctx, name, PROVIDER, {
    settings: () => settings().catalog,
    credential: url => resolveDeepSeekAccountToken(ctx, url),
    load: (url, token, signal) => requestModelListing(url, { [TOKEN_HEADER]: token }, signal),
  })
  let loggedListing: ModelListing | undefined
  /** Resolve the catalog, reporting each listing's hidden entries and dropped badges once. */
  const connectionOf = (view: ListingView): AccountConnection => {
    const resolved = settings()
    const result = resolveListedCatalog({
      listing: view.listing?.entries,
      supported,
      overrides: resolved.modelOverrides,
      routeMaxTokens: resolved.protocol.maxTokens,
      clientVersion: APP_IDENTITY.version,
      ...resolved.catalog.withoutListing === undefined ? {} : { withoutListing: resolved.catalog.withoutListing },
    })
    if (view.listing !== loggedListing) {
      loggedListing = view.listing
      for (const problem of result.problems) console.warn(LOG_TAG, problem)
    }
    return { ...resolved.protocol, models: result.resolution, catalog: result }
  }
  const entry = { provider: PROVIDER, displayName: 'Fiwen Account', settingsNs: ctx.fiber.entry?.options.id ?? name, settingsPath: [] }
  const directory = ctx.llm.registerConfigurableProviders([entry])
  let reportedError: string | undefined
  /** Publish listing and override diagnostics on the provider directory. */
  const discovered = (view: ListingView): AccountConnection => {
    const connection = connectionOf(view)
    const errors = connection.catalog.overrideErrors.slice()
    if (view.authenticated && view.listing === undefined && connection.catalog.offered.length === 0) errors.unshift('model listing unavailable; retrying')
    const error = errors.length === 0 ? undefined : errors.join('; ')
    if (error !== reportedError) {
      reportedError = error
      try {
        directory.replace([error === undefined ? entry : { ...entry, error }])
      } catch (replaceError) {
        // Teardown disposes the registration while an in-flight discovery still settles.
        if (!(replaceError instanceof LlmError && replaceError.code === 'REGISTRATION_DISPOSED')) throw replaceError
      }
    }
    return connection
  }
  registerDeepSeekProvider<AccountConnection>(ctx, PROVIDER, {
    providerName: 'Fiwen Account',
    options: () => connectionOf(catalog.current()),
    connect: async signal => connectionOf(await catalog.view(settings().catalog, signal)),
    resolveAuth,
    admit: (connection, model) => { refuseListedModel(model, connection.catalog.refusals.get(model)) },
    discoverModels: async (provider) => {
      const view = await catalog.view(settings().catalog)
      // Diagnostics publish signed out too, so a sign-out clears a reported listing outage.
      const { offered, badges } = discovered(view).catalog
      if (!view.authenticated) return []
      return offered.map(model => catalogModelInfo(provider, model, badges.get(model.id)))
    },
  })
}
