import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware versions of Link / usePathname / useRouter.
// Always import these instead of the ones from "next/link" and "next/navigation".
export const { Link, usePathname, useRouter } = createNavigation(routing);
