export type ActiveUiScope = 'system' | 'district' | 'diocese' | 'congregation'

export function getHomePathForScope(scope: ActiveUiScope | null | undefined): string {
  switch (scope) {
    case 'system':
      return '/admin'
    case 'district':
      return '/dashboard-kerulet'
    case 'diocese':
      return '/dashboard-egyhazmegye'
    case 'congregation':
    default:
      return '/dashboard'
  }
}
