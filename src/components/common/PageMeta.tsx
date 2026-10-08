import { HelmetProvider, Helmet, type HelmetServerState } from "react-helmet-async";
import { TooltipProvider } from "@/components/ui/tooltip";

const PageMeta = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <Helmet>
    <title>{title}</title>
    <meta name="description" content={description} />
  </Helmet>
);

/**
 * `context` is the prerender's (Story 4.8): on the server, helmet writes the
 * page's `<title>` and description into it. The client passes none.
 */
export const AppWrapper = ({
  children,
  context,
}: {
  children: React.ReactNode;
  context?: { helmet?: HelmetServerState };
}) => (
  <HelmetProvider context={context}>
    <TooltipProvider>
      {children}
    </TooltipProvider>
  </HelmetProvider>
);

export default PageMeta;
