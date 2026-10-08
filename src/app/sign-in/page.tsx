import Image from "next/image";
import { Suspense } from "react";
import { signIn } from "@/auth";
import logo from "@/assets/focus-trail-logo.png";
import styles from "./sign-in.module.css";

async function SignInCard({
  searchParams,
}: {
  searchParams: PageProps<"/sign-in">["searchParams"];
}) {
  const { error } = await searchParams;
  return (
    <section className={styles.card} aria-labelledby="sign-in-title">
      <h1 id="sign-in-title">
        <Image
          src={logo}
          alt="Focus Trail"
          width={240}
          height={93}
          priority
          className={styles.logo}
        />
      </h1>
      <p>Sign in with GitHub to see your repos and milestones.</p>
      {error ? (
        <p className={styles.error} role="alert">
          That GitHub account is not allowed to sign in here.
        </p>
      ) : null}
      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/" });
        }}
      >
        <button type="submit" className={styles.button}>
          Sign in with GitHub
        </button>
      </form>
    </section>
  );
}

export default function SignInPage(props: PageProps<"/sign-in">) {
  return (
    <main className={styles.wrap}>
      <Suspense fallback={<section className={styles.card} aria-busy="true" />}>
        <SignInCard searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
