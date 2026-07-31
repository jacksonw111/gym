import {
  createGymHandler,
  type ApiRequest,
  type GymEnvironment,
} from '../../../../server/gym'
import { getEmasIdentity } from '../../../../server/gym/emas-context'
import {
  createRuntimeEnvironment,
  createRuntimeStore,
  type EmasRuntimeContext,
  loadRuntimeSecrets,
  type StoreFactory,
} from '../../runtime'

interface GymApiEntrypointOptions {
  storeFactory: StoreFactory
  environmentFactory: (context: EmasRuntimeContext) => GymEnvironment
  identityProvider: (
    context: EmasRuntimeContext,
  ) => Promise<{ emasUserId: string } | undefined>
}

export const createGymApiEntrypoint =
  (options: GymApiEntrypointOptions) =>
  async (context: EmasRuntimeContext) => {
    const store = options.storeFactory(context)
    const handler = createGymHandler(
      store,
      options.environmentFactory(context),
      () => options.identityProvider(context),
      (message) => (context.logger ?? console).error(message),
    )
    return handler(context.args as ApiRequest)
  }

export const main = async (context: EmasRuntimeContext) => {
  const secrets = loadRuntimeSecrets()
  return createGymApiEntrypoint({
    storeFactory: createRuntimeStore,
    environmentFactory: (currentContext) =>
      createRuntimeEnvironment(currentContext, secrets),
    identityProvider: getEmasIdentity,
  })(context)
}
