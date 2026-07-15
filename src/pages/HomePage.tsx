import * as React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/db/supabase';
import { usePostHog } from '@posthog/react';
import {
  Trophy,
  TrendingUp,
  BarChart3,
  ChevronRight,
  ChevronLeft,
  Mail,
  Send,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import useEmblaCarousel from 'embla-carousel-react';

// Reusable sticky section label
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm py-3 -mx-4 px-4 md:-mx-6 md:px-6 border-b border-border/40">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{children}</p>
    </div>
  );
}

export default function HomePage() {
  const posthog = usePostHog();
  const [activeStep, setActiveStep] = React.useState(0);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [contactStartedAt, setContactStartedAt] = React.useState(() => new Date().toISOString());

  const [emblaRef, emblaApi] = useEmblaCarousel({ 
    loop: false,
    align: 'center',
    containScroll: false
  });

  const onSelect = React.useCallback(() => {
    if (!emblaApi) return;
    setActiveStep(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  React.useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    onSelect();
  }, [emblaApi, onSelect]);

  const workflowSteps = [
    {
      icon: Trophy,
      image: `${import.meta.env.BASE_URL}assets/wemby_sga_2026.jpg`,
      title: 'Select the Series',
      description: 'Select a live Game 7 or browse our deep historical archives.',
      descriptionFull: 'Select a live Game 7 or browse our deep historical archives. Every series is a new opportunity to decode greatness.',
      step: '01',
      cta: { label: 'Go to Predict', href: '/predict' },
    },
    {
      icon: TrendingUp,
      image: `${import.meta.env.BASE_URL}assets/KLing_dashboards.jpg`,
      title: 'Choose the Strategy',
      description: 'Pick from multiple predictive models.',
      descriptionFull: 'Pick from multiple predictive models. Whether you prefer Bayesian logic or momentum-based Elo ratings, we have the tools.',
      step: '02',
      cta: { label: 'Go to Predict', href: '/predict' },
    },
    {
      icon: BarChart3,
      image: `${import.meta.env.BASE_URL}assets/KLing_trophy.jpg`,
      title: 'Reveal the Outcome',
      description: 'Instantly see the win probability and the key metrics driving it.',
      descriptionFull: 'Instantly see the win probability and the key metrics driving it. Information is power — now you have both.',
      step: '03',
      cta: { label: 'Try It Now', href: '/predict' },
    },
  ];

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const name = String(formData.get('name') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim();
    const message = String(formData.get('message') ?? '').trim();
    const website = String(formData.get('website') ?? '').trim();

    if (name.length < 2 || name.length > 80) {
      toast.error('Please enter a valid name between 2 and 80 characters.');
      setIsSubmitting(false);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      toast.error('Please enter a valid email address.');
      setIsSubmitting(false);
      return;
    }

    if (message.length > 2000) {
      toast.error('Please keep your message within 2000 characters.');
      setIsSubmitting(false);
      return;
    }

    const data = {
      name,
      email,
      message,
      website,
      startedAt: contactStartedAt,
    };

    try {
      const { error } = await supabase.functions.invoke('handle-contact', {
        body: data
      });

      if (error) {
        const errorText = await error?.context?.text();
        let parsedMessage = error.message;

        if (errorText) {
          try {
            const parsed = JSON.parse(errorText);
            parsedMessage = parsed?.error || parsed?.message || errorText;
          } catch {
            parsedMessage = errorText;
          }
        }

        throw new Error(parsedMessage);
      }

      toast.success('Thank you for your message! We will get back to you soon.');
      posthog?.capture('contact_form_submitted');
      form.reset();
      setContactStartedAt(new Date().toISOString());
    } catch (err: any) {
      console.error('Error submitting contact form:', err);
      toast.error(err.message || 'Failed to send message. Please try again.');
      posthog?.captureException(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-20 px-4 md:px-6">
      {/* Hero */}
      <section className="text-center py-16 md:py-24 space-y-5">
        <h1 className="text-4xl md:text-6xl font-medium tracking-tight text-balance font-montserrat">{"Predict Game 7"}</h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto text-pretty">{"A platform designed to decode the most intense moments in NBA history through data and probability."}</p>
      </section>

      {/* Iconic Moments Banner */}
      <section className="pb-24">
        <div className="relative aspect-[21/9] w-full overflow-hidden rounded-[32px] border border-border/40">
          <img 
            src={`${import.meta.env.BASE_URL}assets/nba_game7_moments.jpg`} 
            alt="Iconic NBA Game 7 Moments"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

          {[
            { caption: 'Cavs vs Warriors, 2016', seriesId: '06715a85-ec33-46a4-8383-d058055eefe6', x: '20%', y: '58%', tooltipX: 'left', tooltipY: 'above' },
            { caption: 'Raptors vs 76ers, 2019', seriesId: '29638c4e-261a-4d09-81aa-5740f76175f5', x: '43%', y: '27%', tooltipX: 'center', tooltipY: 'below' },
            { caption: 'Thunder vs Pacers, 2025', seriesId: '626257bc-1678-4c88-84a6-37e0a6cdb49c', x: '57%', y: '90%', tooltipX: 'center', tooltipY: 'above' },
            { caption: 'Heat vs Spurs, 2013', seriesId: 'dd4e81bc-0e10-4ad2-b2eb-8b1fbd8c5e0a', x: '79%', y: '30%', tooltipX: 'right', tooltipY: 'below' },
          ].map((hotspot, index) => (
            <Link
              key={index}
              to={`/predict?series=${hotspot.seriesId}`}
              className="absolute group"
              style={{ left: hotspot.x, top: hotspot.y, transform: 'translate(-50%, -50%)' }}
              onClick={() => posthog?.capture('banner_hotspot_clicked', { caption: hotspot.caption, series_id: hotspot.seriesId })}
            >
              {/* Pulsing ring */}
              <span className="absolute inset-0 rounded-full bg-white/40 animate-ping" />
              
              {/* Circle */}
              <span className="relative flex items-center justify-center w-5 h-5 rounded-full bg-white/80 border border-white group-hover:bg-white transition-colors duration-200" />

              {/* Tooltip */}
              <span
                className={[
                  'absolute z-10 px-3 py-1.5 rounded-lg bg-black/80 text-white text-xs font-medium text-center whitespace-normal w-max max-w-[8rem] sm:max-w-[11rem] opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none',
                  hotspot.tooltipY === 'above' ? 'bottom-full mb-3' : 'top-full mt-3',
                  hotspot.tooltipX === 'left'
                    ? 'left-0'
                    : hotspot.tooltipX === 'right'
                      ? 'right-0'
                      : 'left-1/2 -translate-x-1/2',
                ].join(' ')}
              >
                {hotspot.caption}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Workflow Carousel - Refactored to Gallery style */}
      <section className="space-y-8 pb-24 overflow-hidden">
        <SectionLabel>How It Works</SectionLabel>

        <div className="pt-10 relative group/carousel">
          <div className="embla" ref={emblaRef}>
            <div className="embla__container flex -ml-4 md:-ml-8">
              {workflowSteps.map((step, index) => (
                <div 
                  key={index} 
                  className="embla__slide flex-[0_0_85%] min-w-0 pl-4 md:pl-8"
                >
                  <div className="relative rounded-3xl overflow-hidden h-[500px] md:h-[600px] flex items-end group border border-border/40 transition-all duration-500 hover:border-border">
                    {/* Navigation Edges */}
                    <div 
                      className="absolute inset-y-0 left-0 w-[15%] z-20 cursor-pointer" 
                      onClick={() => emblaApi?.scrollPrev()}
                    />
                    <div 
                      className="absolute inset-y-0 right-0 w-[15%] z-20 cursor-pointer" 
                      onClick={() => emblaApi?.scrollNext()}
                    />

                    {/* Background Image with Overlay */}
                    <div 
                      className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-700 group-hover:scale-105"
                      style={{ backgroundImage: `url(${step.image})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />

                    {/* Content Overlay */}
                    <div className="relative z-30 p-6 md:p-12 w-full space-y-6 pointer-events-none">
                      <div className="flex items-center gap-4">
                        <span className="text-white/60 text-[10px] md:text-xs font-semibold uppercase tracking-[0.2em]">Step {step.step}</span>
                        <div className="h-px w-8 md:w-12 bg-white/20" />
                      </div>
                      
                      <Link to={step.cta.href} className="block group/title pointer-events-auto">
                        <h2 className="text-3xl md:text-5xl font-medium text-white tracking-tight flex items-center gap-4 group-hover/title:text-white/90 transition-colors">
                          {step.title}
                          <ArrowRight className="h-6 w-6 md:h-8 md:w-8 opacity-0 -translate-x-4 group-hover/title:opacity-100 group-hover/title:translate-x-0 transition-all duration-300 shrink-0" />
                        </h2>
                      </Link>

                      <p className="text-white/70 text-base md:text-xl max-w-xl leading-relaxed text-pretty font-light">
                        <span className="md:hidden">{step.description}</span>
                        <span className="hidden md:inline">{step.descriptionFull}</span>
                      </p>

                      <div className="flex items-center gap-6 pt-2">
                        <div className="flex gap-2">
                          {workflowSteps.map((_, i) => (
                            <div
                              key={i}
                              className={`h-0.5 rounded-full transition-all duration-500 ${
                                i === activeStep ? 'w-8 bg-white' : 'w-2 bg-white/20'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Edge Navigation Buttons */}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              emblaApi?.scrollPrev();
            }}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 h-full w-20 flex items-center justify-start pl-4 opacity-0 group-hover/carousel:opacity-100 transition-opacity hidden md:flex"
            aria-label="Previous slide"
          >
            <div className="bg-background/20 backdrop-blur-md p-2 rounded-full border border-white/20 hover:bg-background/40 transition-colors">
              <ChevronLeft className="h-5 w-5 text-white" />
            </div>
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              emblaApi?.scrollNext();
            }}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 h-full w-20 flex items-center justify-end pr-4 opacity-0 group-hover/carousel:opacity-100 transition-opacity hidden md:flex"
            aria-label="Next slide"
          >
            <div className="bg-background/20 backdrop-blur-md p-2 rounded-full border border-white/20 hover:bg-background/40 transition-colors">
              <ChevronRight className="h-5 w-5 text-white" />
            </div>
          </button>
        </div>
      </section>

      {/* Historical Data & Insights Merged */}
      <section className="space-y-0 pb-24">
        <SectionLabel>History & Insights</SectionLabel>
        
        <div className="space-y-32 pt-16">
          {/* Deep Dive into NBA History */}
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <h2 className="text-3xl md:text-4xl font-medium tracking-tight">Deep Dive into NBA History</h2>
              <p className="text-lg text-muted-foreground leading-relaxed text-pretty font-light">
                Explore our comprehensive database of every <span className="whitespace-nowrap">Game 7</span> in NBA history. Analyze patterns, historical upsets, and dominant performances that have defined the playoff landscape.
              </p>
            </div>
            <Link 
              to="/historical"
              className="group relative aspect-[4/3] bg-muted rounded-2xl overflow-hidden flex items-center justify-center border border-border/50 transition-all duration-300 hover:border-primary/50"
            >
              <img 
                src={`${import.meta.env.BASE_URL}assets/lal-bos-1969.jpeg`}
                alt="NBA History"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/10 group-hover:bg-black/50 transition-colors duration-300 z-10 flex items-center justify-center">
                <span className="text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                  Explore Historical Data
                  <ChevronRight className="ml-2 h-4 w-4" />
                </span>
              </div>
            </Link>
          </div>

          {/* Statistical Patterns Revealed */}
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <Link 
              to="/insights"
              className="group relative order-2 md:order-1 aspect-[4/3] bg-muted rounded-2xl overflow-hidden flex items-center justify-center border border-border/50 transition-all duration-300 hover:border-primary/50"
            >
              <img 
                src={`${import.meta.env.BASE_URL}assets/KLing_court.jpg`}
                alt="Statistical Patterns"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/10 group-hover:bg-black/50 transition-colors duration-300 z-10 flex items-center justify-center">
                <span className="text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center translate-y-2 group-hover:translate-y-0 transition-transform duration-300 text-center">
                  View Insights Dashboard
                  <ChevronRight className="ml-2 h-4 w-4" />
                </span>
              </div>
            </Link>
            <div className="order-1 md:order-2 space-y-6">
              <h2 className="text-3xl md:text-4xl font-medium tracking-tight">Statistical Patterns Revealed</h2>
              <p className="text-lg text-muted-foreground leading-relaxed text-pretty font-light">
                Our insights dashboard translates complex historical data into understandable trends. See how home court advantage, momentum, and point differentials actually influence the final outcome.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="space-y-0 pb-24">
        <SectionLabel>Our Story</SectionLabel>
        <div className="max-w-2xl space-y-6 pt-10">
          <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-left">About Predict <span className="whitespace-nowrap">Game 7</span></h2>
          <div className="space-y-4 text-base md:text-lg text-muted-foreground leading-relaxed text-pretty font-light text-left">
            <p>{"Founded by a group of sports analysts and data scientists, Predict Game 7 was born from a passion for understanding the \"why\" behind the most pressurized games in sports. We believe that while every Game 7 is unique, historical data provides a powerful lens for looking into the future."}</p>
            <p>
              Our mission is to provide fans, analysts, and enthusiasts with accessible yet powerful statistical tools to explore the drama of <span className="whitespace-nowrap">Game 7s</span> through an objective, data-driven perspective.
            </p>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="space-y-0 pb-8">
        <SectionLabel>Contact</SectionLabel>
        <div className="grid md:grid-cols-2 gap-10 pt-10">
          <div className="space-y-5">
            <h2 className="text-2xl md:text-3xl font-medium tracking-tight">Get in Touch</h2>
            <p className="text-muted-foreground leading-relaxed text-pretty font-light">
              Have questions about our methodology or want to suggest a feature? We'd love to hear from you.
            </p>
            <div className="flex items-center gap-3 text-muted-foreground pt-2">
              <Mail className="h-4 w-4 shrink-0" />
              <span className="text-sm font-light">ujsolon@gmail.com</span>
            </div>
          </div>
          <form onSubmit={handleContactSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs uppercase tracking-widest font-semibold text-muted-foreground ml-1">Name</Label>
              <Input id="name" name="name" placeholder="Your name" className="bg-background border-border/60" autoComplete="name" maxLength={80} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs uppercase tracking-widest font-semibold text-muted-foreground ml-1">Email</Label>
              <Input id="email" name="email" type="email" placeholder="your@email.com" className="bg-background border-border/60" autoComplete="email" maxLength={320} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message" className="text-xs uppercase tracking-widest font-semibold text-muted-foreground ml-1">Message</Label>
              <Textarea id="message" name="message" placeholder="How can we help?" className="min-h-[100px] bg-background border-border/60 resize-none" maxLength={2000} required />
            </div>

            <div className="hidden" aria-hidden="true">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                name="website"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Anti-spam checks run automatically when you send a message.
            </p>

            <Button type="submit" disabled={isSubmitting} className="w-full group">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  Send Message
                  <Send className="ml-2 h-4 w-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </>
              )}
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
