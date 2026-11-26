import { INSTANCE, MODE } from "@/lib/instance";
import { sourceSerif, plexSans, plexMono } from "@/app/fonts";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${sourceSerif.variable} ${plexSans.variable} ${plexMono.variable} flex min-h-screen items-center justify-center bg-brand-band px-4 font-sans text-brand-text`}>
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="font-serif text-[30px] font-bold tracking-[-0.01em] text-brand-navyDeep">River Hub</p>
          <p className="text-[14px] text-brand-body">{MODE === "national" ? "Members\u2019 area" : INSTANCE.orgName}</p>
        </div>
        <div className="card">{children}</div>
      </div>
    </div>
  );
}
