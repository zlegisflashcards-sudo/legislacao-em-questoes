"use client";

import type { MouseEvent, ReactNode } from "react";
import { freeStudyLoginHref } from "@/lib/free-study-access";
import { supabase } from "@/lib/supabase";

type FreeStudyLinkProps = {
  studyHref: string;
  className: string;
  children: ReactNode;
};

/**
 * The public href provides a usable destination before hydration. On click we
 * check the existing session, so signed-in students go straight to the study
 * surface and visitors first see the account screen.
 */
export function FreeStudyLink({ studyHref, className, children }: FreeStudyLinkProps) {
  const loginHref = freeStudyLoginHref(studyHref);

  async function openStudy(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const { data } = await supabase.auth.getSession();
    window.location.assign(data.session ? studyHref : loginHref);
  }

  return <a href={loginHref} onClick={(event) => void openStudy(event)} className={className}>{children}</a>;
}
