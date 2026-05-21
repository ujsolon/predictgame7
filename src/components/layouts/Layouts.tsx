import { Link, useLocation } from 'react-router-dom';
import { Home, TrendingUp, History, BarChart3, Menu, Sigma } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: 'Home', path: '/', icon: Home },
  { name: 'Predict', path: '/predict', icon: TrendingUp },
  { name: 'Historical', path: '/historical', icon: History },
  { name: 'Insights', path: '/insights', icon: BarChart3 },
  { name: 'Maths', path: '/maths', icon: Sigma },
];

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const NavLinks = () => (
    <>
      {navigation.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={() => setMobileMenuOpen(false)}
            className={`flex items-center gap-3 px-4 py-3 text-sm font-normal transition-colors ${
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="flex min-h-screen w-full">
      <aside className="hidden lg:flex lg:flex-col lg:w-64 shrink-0 border-r border-sidebar-border bg-sidebar">
        <div className="flex h-16 items-center border-b border-sidebar-border px-6">
          <h1 className="text-lg font-medium text-sidebar-foreground">Predict <span className="whitespace-nowrap">Game 7</span></h1>
        </div>
        <nav className="flex-1 py-6">
          <NavLinks />
        </nav>
      </aside>

      <div className="flex-1 min-w-0 overflow-x-hidden flex flex-col">
        <header className="flex h-16 items-center gap-4 border-b border-border bg-background px-4 md:px-8 lg:hidden">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-sidebar">
              <div className="flex h-16 items-center border-b border-sidebar-border px-6">
                <h1 className="text-lg font-medium text-sidebar-foreground">Predict <span className="whitespace-nowrap">Game 7</span></h1>
              </div>
              <nav className="py-6">
                <NavLinks />
              </nav>
            </SheetContent>
          </Sheet>
          <h1 className="text-lg font-medium">Predict <span className="whitespace-nowrap">Game 7</span></h1>
        </header>

        <main className="flex-1 p-6 md:p-12">
          {children}
        </main>
      </div>
    </div>
  );
}
