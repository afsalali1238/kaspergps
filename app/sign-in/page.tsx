import { redirect } from 'next/navigation';

// The email form moved to /dev/sign-in (prototype only). Sign-in now starts from the role picker.
export default function SignInRedirect() {
  redirect('/');
}
