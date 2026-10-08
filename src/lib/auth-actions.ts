"use server";
import { redirect } from "next/navigation";
import { destroySession } from "./auth";

/** Sign out (use from a POST <form action={logoutAction}>). */
export async function logoutAction() {
  await destroySession();
  redirect("/");
}
