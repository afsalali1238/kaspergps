// Log out: clear the session and any walkthrough, then return to the role picker.
// Used by the app menu, the console header and the demo bar's "Switch role".
import { storeActions } from '@/hooks';

export function signOutToRoles(navigate: (path: string) => void): void {
  storeActions.setWalkthrough(null);
  storeActions.setSession(null);
  navigate('/');
}
