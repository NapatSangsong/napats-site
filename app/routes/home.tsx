import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "Napat Sangsong — Senior Frontend Developer" },
		{
			name: "description",
			content:
				"Senior Frontend Developer with 15+ years of enterprise application experience. Developer. Musician. Photographer.",
		},
	];
}



//1


export default function Home() {
	return (
		<div className="film-grain min-h-screen bg-[#0a0a0a] text-[#e5e5e5]">
			{/* Navigation */}
			<nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/[0.04]">
				<div className="max-w-6xl mx-auto px-8 py-5 flex items-center justify-between">
					<a href="#" className="flex items-center gap-2">
						<span className="font-serif text-xl font-medium tracking-tight text-white">
							Napat
						</span>
						<span className="leica-dot" />
					</a>
					<div className="hidden sm:flex items-center gap-10 mono-accent text-xs uppercase tracking-[0.2em] text-white/40">
						<a href="#about" className="link-reveal hover:text-white transition-colors duration-300">
							About
						</a>
						<a href="#work" className="link-reveal hover:text-white transition-colors duration-300">
							Work
						</a>
						<a href="#expertise" className="link-reveal hover:text-white transition-colors duration-300">
							Expertise
						</a>
						<a href="#personal" className="link-reveal hover:text-white transition-colors duration-300">
							Personal
						</a>
						<a href="#contact" className="link-reveal hover:text-white transition-colors duration-300">
							Contact
						</a>
					</div>
				</div>
			</nav>

			{/* Hero */}
			<section className="min-h-screen flex flex-col justify-center px-8 relative">
				<div className="max-w-6xl mx-auto w-full">
					{/* Top label */}
					<div className="animate-fade-in mb-8">
						<span className="mono-accent text-[11px] uppercase tracking-[0.3em] text-white/30">
							Senior Frontend Developer
						</span>
					</div>

					{/* Name */}
					<h1 className="animate-fade-in animate-delay-100">
						<span className="font-serif text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-medium tracking-tight text-white leading-[0.9]">
							Napat
						</span>
						<br />
						<span className="font-serif text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-medium tracking-tight text-white/20 leading-[0.9]">
							Sangsong
						</span>
					</h1>

					{/* Descriptor line */}
					<div className="animate-fade-in animate-delay-300 mt-10 flex items-center gap-6">
						<div className="h-px w-16 bg-white/20" />
						<p className="mono-accent text-xs tracking-[0.15em] text-white/40 uppercase">
							Developer &mdash; Music &mdash; B&W Photography
						</p>
					</div>

					{/* Brief */}
					<p className="animate-fade-in animate-delay-400 mt-8 text-lg sm:text-xl text-white/50 max-w-xl leading-relaxed font-light">
						15+ years architecting mission-critical enterprise systems.
						Capturing the world in monochrome through a Leica lens.
						Finding rhythm in code and music alike.
					</p>

					{/* Stats row */}
					<div className="animate-fade-in animate-delay-500 mt-14 flex flex-wrap gap-12">
						{[
							{ value: "15+", label: "Years" },
							{ value: "50+", label: "Projects" },
							{ value: "8+", label: "Technologies" },
						].map((stat) => (
							<div key={stat.label}>
								<p className="font-serif text-3xl sm:text-4xl text-white font-medium">
									{stat.value}
								</p>
								<p className="mono-accent text-[10px] uppercase tracking-[0.25em] text-white/30 mt-1">
									{stat.label}
								</p>
							</div>
						))}
					</div>
				</div>

				{/* Scroll indicator */}
				<div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 pulse-subtle">
					<span className="mono-accent text-[9px] uppercase tracking-[0.3em] text-white/20">
						Scroll
					</span>
					<div className="w-px h-8 bg-gradient-to-b from-white/30 to-transparent" />
				</div>
			</section>

			{/* Marquee divider */}
			<div className="overflow-hidden border-y border-white/[0.04] py-4">
				<div className="marquee-track flex whitespace-nowrap">
					{Array.from({ length: 2 }).map((_, i) => (
						<span
							key={i}
							className="mono-accent text-[11px] uppercase tracking-[0.3em] text-white/10 mx-8"
						>
							C# &nbsp;&middot;&nbsp; .NET Framework &nbsp;&middot;&nbsp;
							SharePoint SPFx &nbsp;&middot;&nbsp; TypeScript
							&nbsp;&middot;&nbsp; React &nbsp;&middot;&nbsp; Kendo UI
							&nbsp;&middot;&nbsp; MSAL &nbsp;&middot;&nbsp; SQL Server
							&nbsp;&middot;&nbsp; REST APIs &nbsp;&middot;&nbsp; Leica
							Photography &nbsp;&middot;&nbsp; Music &nbsp;&middot;&nbsp;
							Enterprise Architecture &nbsp;&middot;&nbsp; PTT/PTTGC
							&nbsp;&middot;&nbsp; Fortune 500 &nbsp;&middot;&nbsp;
						</span>
					))}
				</div>
			</div>

			{/* About */}
			<section id="about" className="py-28 sm:py-36 px-8">
				<div className="max-w-6xl mx-auto">
					<div className="grid lg:grid-cols-12 gap-16 lg:gap-20">
						{/* Left column */}
						<div className="lg:col-span-4">
							<span className="mono-accent text-[10px] uppercase tracking-[0.3em] text-white/25 block mb-4">
								01 / About
							</span>
							<h2 className="font-serif text-4xl sm:text-5xl text-white tracking-tight leading-tight">
								Hello,
								<br />
								I'm Napat.
							</h2>
						</div>

						{/* Right column */}
						<div className="lg:col-span-8 space-y-6 text-white/50 text-base sm:text-lg leading-relaxed">
							<p>
								Currently architecting mission-critical platforms for{" "}
								<span className="text-white/80">PTT/PTTGC Group</span> — working
								in regulated, high-stakes energy sector environments where
								failure is not an option. My expertise spans C#, .NET Framework,
								SharePoint SPFx, Kendo UI, and modern JavaScript ecosystems.
							</p>
							<p>
								I specialize in complex{" "}
								<span className="text-white/80">MSAL authentication systems</span>,
								cross-platform browser compatibility, database optimization, and
								API architecture. I've successfully implemented enterprise
								solutions requiring sophisticated token management, CORS
								configuration, and seamless integration between legacy and modern
								technology stacks.
							</p>
							<p>
								I write code that balances elegance with maintainability —
								approaching every system with forward-thinking architecture,
								considering scalability, security, and long-term technical debt.
							</p>
							<p className="text-white/30 text-sm">
								Bilingual (Thai/English) &middot; International experience &middot;
								Emerging technology advocate
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* Divider */}
			<div className="max-w-6xl mx-auto px-8">
				<div className="hr-ornament">
					<span className="leica-dot" />
				</div>
			</div>

			{/* Work / Projects */}
			<section id="work" className="py-28 sm:py-36 px-8">
				<div className="max-w-6xl mx-auto">
					<span className="mono-accent text-[10px] uppercase tracking-[0.3em] text-white/25 block mb-4">
						02 / Selected Work
					</span>
					<h2 className="font-serif text-4xl sm:text-5xl text-white tracking-tight mb-16">
						Key Projects
					</h2>

					<div className="grid md:grid-cols-3 gap-6 stagger-children">
						{/* GSP eMoC */}
						<div className="card-lift group p-8 bg-white/[0.02] bw-border rounded-sm hover:bg-white/[0.04] transition-colors duration-500">
							<div className="flex items-center justify-between mb-6">
								<span className="mono-accent text-[10px] uppercase tracking-[0.25em] text-white/20">
									Enterprise
								</span>
								<svg
									className="w-5 h-5 text-white/10 group-hover:text-white/30 transition-colors duration-500"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1}
										d="M7 17L17 7M17 7H7M17 7V17"
									/>
								</svg>
							</div>
							<h3 className="font-serif text-2xl text-white mb-2">GSP eMoC</h3>
							<p className="mono-accent text-[10px] uppercase tracking-[0.2em] text-white/30 mb-4">
								PTT/PTTGC Group
							</p>
							<p className="text-sm text-white/40 leading-relaxed">
								Electronic Management of Change for enterprise workflow
								coordination. SharePoint SPFx, MSAL authentication, sophisticated
								token management, and localStorage strategies.
							</p>
						</div>

						{/* IdeaMANI */}
						<div className="card-lift group p-8 bg-white/[0.02] bw-border rounded-sm hover:bg-white/[0.04] transition-colors duration-500">
							<div className="flex items-center justify-between mb-6">
								<span className="mono-accent text-[10px] uppercase tracking-[0.25em] text-white/20">
									Enterprise
								</span>
								<svg
									className="w-5 h-5 text-white/10 group-hover:text-white/30 transition-colors duration-500"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1}
										d="M7 17L17 7M17 7H7M17 7V17"
									/>
								</svg>
							</div>
							<h3 className="font-serif text-2xl text-white mb-2">IdeaMANI</h3>
							<p className="mono-accent text-[10px] uppercase tracking-[0.2em] text-white/30 mb-4">
								PTT/PTTGC Group
							</p>
							<p className="text-sm text-white/40 leading-relaxed">
								Investment type validation and portfolio management. Complex
								validation logic, cross-platform browser compatibility, CORS
								configuration, and enterprise integration architecture.
							</p>
						</div>

						{/* Stock Photography */}
						<div className="card-lift group p-8 bg-white/[0.02] bw-border rounded-sm hover:bg-white/[0.04] transition-colors duration-500">
							<div className="flex items-center justify-between mb-6">
								<span className="mono-accent text-[10px] uppercase tracking-[0.25em] text-white/20">
									Venture
								</span>
								<svg
									className="w-5 h-5 text-white/10 group-hover:text-white/30 transition-colors duration-500"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1}
										d="M7 17L17 7M17 7H7M17 7V17"
									/>
								</svg>
							</div>
							<h3 className="font-serif text-2xl text-white mb-2">
								Stock Photography
							</h3>
							<p className="mono-accent text-[10px] uppercase tracking-[0.2em] text-white/30 mb-4">
								Entrepreneurial
							</p>
							<p className="text-sm text-white/40 leading-relaxed">
								Digital asset monetization with strategic SEO optimization,
								seasonal trend analysis, market psychology, and user-centric
								design positioning.
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* Divider */}
			<div className="max-w-6xl mx-auto px-8">
				<div className="hr-ornament">
					<span className="leica-dot" />
				</div>
			</div>

			{/* Expertise */}
			<section id="expertise" className="py-28 sm:py-36 px-8">
				<div className="max-w-6xl mx-auto">
					<span className="mono-accent text-[10px] uppercase tracking-[0.3em] text-white/25 block mb-4">
						03 / Expertise
					</span>
					<h2 className="font-serif text-4xl sm:text-5xl text-white tracking-tight mb-16">
						Technical Discipline
					</h2>

					{/* Expertise grid */}
					<div className="grid sm:grid-cols-2 gap-px bg-white/[0.04] stagger-children">
						{[
							{
								number: "01",
								title: "Frontend Architecture",
								items: [
									"React & TypeScript",
									"SharePoint SPFx",
									"Kendo UI Components",
									"Cross-browser Compatibility",
								],
							},
							{
								number: "02",
								title: "Backend & APIs",
								items: [
									"C# / .NET Framework",
									"REST API Architecture",
									"API Controller Documentation",
									"Legacy-to-modern Integration",
								],
							},
							{
								number: "03",
								title: "Auth & Security",
								items: [
									"MSAL Implementation",
									"Token Management",
									"CORS Configuration",
									"Safari Mobile/Desktop Issues",
								],
							},
							{
								number: "04",
								title: "Database & DevOps",
								items: [
									"SQL Server Optimization",
									"Index Tuning & Migration",
									"GitHub & SSH Infrastructure",
									"Server Management",
								],
							},
						].map((area) => (
							<div
								key={area.number}
								className="group bg-[#0a0a0a] p-8 sm:p-10 hover:bg-white/[0.02] transition-colors duration-500"
							>
								<span className="mono-accent text-[10px] text-white/15 tracking-[0.25em] block mb-6">
									{area.number}
								</span>
								<h3 className="font-serif text-xl sm:text-2xl text-white mb-6">
									{area.title}
								</h3>
								<ul className="space-y-3">
									{area.items.map((item) => (
										<li
											key={item}
											className="flex items-center gap-3 text-sm text-white/35 group-hover:text-white/50 transition-colors duration-500"
										>
											<span className="w-1 h-1 rounded-full bg-white/20 shrink-0" />
											{item}
										</li>
									))}
								</ul>
							</div>
						))}
					</div>

					{/* Tech tags */}
					<div className="mt-16">
						<div className="flex flex-wrap gap-3">
							{[
								"C#",
								".NET",
								"SharePoint SPFx",
								"TypeScript",
								"JavaScript",
								"React",
								"Kendo UI",
								"MSAL",
								"SQL Server",
								"REST APIs",
								"Git",
								"Cloudflare",
								"Tailwind CSS",
							].map((tech) => (
								<span
									key={tech}
									className="mono-accent text-[10px] uppercase tracking-[0.2em] px-4 py-2 border border-white/[0.06] text-white/25 hover:text-white/50 hover:border-white/[0.12] transition-all duration-300 rounded-sm"
								>
									{tech}
								</span>
							))}
						</div>
					</div>
				</div>
			</section>

			{/* Divider */}
			<div className="max-w-6xl mx-auto px-8">
				<div className="hr-ornament">
					<span className="leica-dot" />
				</div>
			</div>

			{/* Personal / Beyond Code */}
			<section id="personal" className="py-28 sm:py-36 px-8">
				<div className="max-w-6xl mx-auto">
					<span className="mono-accent text-[10px] uppercase tracking-[0.3em] text-white/25 block mb-4">
						04 / Beyond Code
					</span>
					<h2 className="font-serif text-4xl sm:text-5xl text-white tracking-tight mb-6">
						The Other Frames
					</h2>
					<p className="text-white/30 text-base max-w-xl mb-16 leading-relaxed">
						A developer's life needs contrast — like a good photograph. These are
						the things that give my work depth.
					</p>

					<div className="grid md:grid-cols-3 gap-6 stagger-children">
						{/* Music */}
						<div className="card-lift group p-8 bg-white/[0.02] bw-border rounded-sm hover:bg-white/[0.04] transition-colors duration-500 relative overflow-hidden">
							<div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-white/[0.02] to-transparent" />
							<div className="mb-6">
								<svg
									className="w-8 h-8 text-white/15 group-hover:text-white/30 transition-colors duration-500"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1}
										d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
									/>
								</svg>
							</div>
							<h3 className="font-serif text-xl text-white mb-3">
								Music & Culture
							</h3>
							<p className="text-sm text-white/35 leading-relaxed mb-4">
								Passionate listener across K-pop and T-pop. Quality vocal
								performances and diverse musical textures.
							</p>
							<div className="flex flex-wrap gap-2">
								{["Yerin Baek", "LEE HI", "Minsu", "Bol4", "Serious Bacon"].map(
									(artist) => (
										<span
											key={artist}
											className="mono-accent text-[9px] uppercase tracking-[0.15em] px-2.5 py-1 border border-white/[0.06] text-white/20 rounded-sm"
										>
											{artist}
										</span>
									),
								)}
							</div>
						</div>

						{/* Literature */}
						<div className="card-lift group p-8 bg-white/[0.02] bw-border rounded-sm hover:bg-white/[0.04] transition-colors duration-500 relative overflow-hidden">
							<div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-white/[0.02] to-transparent" />
							<div className="mb-6">
								<svg
									className="w-8 h-8 text-white/15 group-hover:text-white/30 transition-colors duration-500"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1}
										d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
									/>
								</svg>
							</div>
							<h3 className="font-serif text-xl text-white mb-3">
								Literary Engagement
							</h3>
							<p className="text-sm text-white/35 leading-relaxed">
								Active novel reader with consistent literary engagement —
								providing intellectual counterbalance to technical work and
								broadening creative perspective. The quiet discipline of reading
								sharpens the mind for code.
							</p>
						</div>

						{/* Thuaifu */}
						<div className="card-lift group p-8 bg-white/[0.02] bw-border rounded-sm hover:bg-white/[0.04] transition-colors duration-500 relative overflow-hidden">
							<div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-white/[0.02] to-transparent" />
							<div className="mb-6">
								<svg
									className="w-8 h-8 text-white/15 group-hover:text-white/30 transition-colors duration-500"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1}
										d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z"
									/>
								</svg>
							</div>
							<h3 className="font-serif text-xl text-white mb-3">
								Thuaifu
							</h3>
							<p className="mono-accent text-[10px] uppercase tracking-[0.2em] text-white/20 mb-3">
								15-year-old senior cat
							</p>
							<p className="text-sm text-white/35 leading-relaxed">
								Dedicated caretaker for a beloved senior feline companion.
								Managing health with analytical veterinary care and unwavering
								commitment — the most important long-running project.
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* Contact */}
			<section
				id="contact"
				className="py-28 sm:py-36 px-8 border-t border-white/[0.04]"
			>
				<div className="max-w-6xl mx-auto">
					<div className="grid lg:grid-cols-12 gap-16">
						<div className="lg:col-span-7">
							<span className="mono-accent text-[10px] uppercase tracking-[0.3em] text-white/25 block mb-4">
								05 / Contact
							</span>
							<h2 className="font-serif text-4xl sm:text-5xl md:text-6xl text-white tracking-tight mb-8 leading-tight">
								Let's build
								<br />
								something
								<br />
								<span className="text-white/20">together.</span>
							</h2>
							<p className="text-white/35 text-base max-w-md leading-relaxed">
								Open to discussing enterprise solutions, creative collaborations,
								or opportunities to architect mission-critical systems in
								regulated environments.
							</p>
						</div>
						<div className="lg:col-span-5 flex flex-col justify-end gap-4">
							<a
								href="mailto:hello@example.com"
								className="group flex items-center justify-between p-5 border border-white/[0.06] hover:border-white/[0.15] hover:bg-white/[0.02] transition-all duration-500 rounded-sm"
							>
								<div className="flex items-center gap-4">
									<svg
										className="w-5 h-5 text-white/25"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={1}
											d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
										/>
									</svg>
									<span className="mono-accent text-xs uppercase tracking-[0.15em] text-white/50">
										Email
									</span>
								</div>
								<svg
									className="w-4 h-4 text-white/15 group-hover:text-white/40 group-hover:translate-x-1 transition-all duration-300"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
									/>
								</svg>
							</a>
							<a
								href="https://github.com"
								target="_blank"
								rel="noopener noreferrer"
								className="group flex items-center justify-between p-5 border border-white/[0.06] hover:border-white/[0.15] hover:bg-white/[0.02] transition-all duration-500 rounded-sm"
							>
								<div className="flex items-center gap-4">
									<svg
										className="w-5 h-5 text-white/25"
										fill="currentColor"
										viewBox="0 0 24 24"
									>
										<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
									</svg>
									<span className="mono-accent text-xs uppercase tracking-[0.15em] text-white/50">
										GitHub
									</span>
								</div>
								<svg
									className="w-4 h-4 text-white/15 group-hover:text-white/40 group-hover:translate-x-1 transition-all duration-300"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
									/>
								</svg>
							</a>
							<a
								href="https://linkedin.com"
								target="_blank"
								rel="noopener noreferrer"
								className="group flex items-center justify-between p-5 border border-white/[0.06] hover:border-white/[0.15] hover:bg-white/[0.02] transition-all duration-500 rounded-sm"
							>
								<div className="flex items-center gap-4">
									<svg
										className="w-5 h-5 text-white/25"
										fill="currentColor"
										viewBox="0 0 24 24"
									>
										<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
									</svg>
									<span className="mono-accent text-xs uppercase tracking-[0.15em] text-white/50">
										LinkedIn
									</span>
								</div>
								<svg
									className="w-4 h-4 text-white/15 group-hover:text-white/40 group-hover:translate-x-1 transition-all duration-300"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
									/>
								</svg>
							</a>
						</div>
					</div>
				</div>
			</section>

			{/* Footer */}
			<footer className="py-8 px-8 border-t border-white/[0.04]">
				<div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<span className="font-serif text-sm text-white/30">
							&copy; 2026 Napat Sangsong
						</span>
						<span className="leica-dot" />
					</div>
					<span className="mono-accent text-[9px] uppercase tracking-[0.3em] text-white/15">
						Developed with precision
					</span>
				</div>
			</footer>
		</div>
	);
}
