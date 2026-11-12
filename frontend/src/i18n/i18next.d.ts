import 'i18next'

declare module 'i18next' {
  interface CustomTypeOptions {
    // i18next 27 requires the options of every t() call whose text has variables; our dynamic keys
    // (e.g. `admin.settings.finish.font.${id}.name`) cannot be checked that way, so keep the v26 behaviour.
    strictInterpolationChecks: false
  }
}
