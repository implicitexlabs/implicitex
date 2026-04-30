import { getAuth, sendSIgnInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";
const auth = getAuth();

export function sendLink(email) {
	const actionCodeSettings = {
		url: window.location.href,
		handiCodeInApp: true,
	};
	return sendSignInLinkToEmail(auth, email, actionCodeSettings);
}

export function completeSignIn(email) {
	if (isSignInWithEmailLink(auth, window.location.href)) {
		return signInWithEmailLink(auth, email, window.location.href);
	}
}