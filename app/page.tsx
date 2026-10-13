import type { Metadata } from 'next';
import { RolePicker } from '@/components/auth/RolePicker';

export const metadata: Metadata = {
  title: 'Choose a role · Kasper GPS',
};

// The home page is the role picker (chunk R). It never redirects: a signed-in
// visitor can still pick another role, and "Log out" returns here.
export default function RootPage() {
  return <RolePicker />;
}
