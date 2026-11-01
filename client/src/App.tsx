import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

const Home = lazy(() => import("@/pages/Home"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Clients = lazy(() => import("@/pages/Clients"));
const ClientDetail = lazy(() => import("@/pages/ClientDetail"));
const Partners = lazy(() => import("@/pages/Partners"));
const AlarmSystems = lazy(() => import("@/pages/AlarmSystems"));
const Settings = lazy(() => import("@/pages/Settings"));
const ManagingCompany = lazy(() => import("@/pages/ManagingCompany"));
const ContactId = lazy(() => import("@/pages/ContactId"));
const Reports = lazy(() => import("@/pages/Reports"));
const Finalizations = lazy(() => import("@/pages/Finalizations"));
const UsersPage = lazy(() => import("@/pages/Users"));
const Login = lazy(() => import("@/pages/Login"));

function RouteLoading() {
  return (
    <div className="flex min-h-[45vh] items-center justify-center p-6" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <span>Abrindo tela…</span>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/clients" component={Clients} />
        <Route path="/clients/:id" component={ClientDetail} />
        <Route path="/partners" component={Partners} />
        <Route path="/alarm-systems" component={AlarmSystems} />
        <Route path="/settings" component={Settings} />
        <Route path="/managing-company" component={ManagingCompany} />
        <Route path="/contact-id" component={ContactId} />
        <Route path="/reports" component={Reports} />
        <Route path="/finalizations" component={Finalizations} />
        <Route path="/users" component={UsersPage} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
