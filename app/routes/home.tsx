import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "Napat Sangsong — Senior Frontend Developer" },
		{
			name: "description",
			content:
				"Senior Frontend Developer with 15+ years of enterprise application experience, specializing in scalable, production-grade systems for Fortune 500 organizations.",
		},
	];
}

export default function Home() {
	return (
		<div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
			{/* Navigation */}
			<nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
				<div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
					<span className="text-lg font-semibold tracking-tight">
						NS<span className="text-gray-400">.</span>
					</span>
					<div className="flex gap-8 text-sm text-gray-500 dark:text-gray-400">
						<a
							href="#about"
							className="hover:text-gray-900 dark:hover:text-white transition-colors"
						>
							About
						</a>
						<a
							href="#projects"
							className="hover:text-gray-900 dark:hover:text-white transition-colors"
						>
							Projects
						</a>
						<a
							href="#skills"
							className="hover:text-gray-900 dark:hover:text-white transition-colors"
						>
							Skills
						</a>
						<a
							href="#hobbies"
							className="hover:text-gray-900 dark:hover:text-white transition-colors"
						>
							Hobbies
						</a>
						<a
							href="#contact"
							className="hover:text-gray-900 dark:hover:text-white transition-colors"
						>
							Contact
						</a>
					</div>
				</div>
			</nav>

			{/* Hero Section */}
			<section className="min-h-screen flex items-center justify-center px-6">
				<div className="max-w-3xl text-center">
					<div className="mb-6">
						<div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-800 text-3xl font-bold text-gray-700 dark:text-gray-300">
							NS
						</div>
					</div>
					<h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">
						Napat Sangsong
					</h1>
					<p className="text-xl sm:text-2xl text-gray-500 dark:text-gray-400 font-light mb-8">
						Senior Frontend Developer
					</p>
					<p className="text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
						15+ years of enterprise application experience, specializing in
						scalable, production-grade systems for Fortune 500 organizations in
						the energy sector.
					</p>
					<div className="mt-10">
						<a
							href="#about"
							className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
						>
							Scroll to explore
							<svg
								className="w-4 h-4 animate-bounce"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M19 14l-7 7m0 0l-7-7m7 7V3"
								/>
							</svg>
						</a>
					</div>
				</div>
			</section>

			{/* About Section */}
			<section id="about" className="py-24 px-6">
				<div className="max-w-5xl mx-auto">
					<div className="grid md:grid-cols-2 gap-16 items-center">
						<div>
							<p className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-3">
								About Me
							</p>
							<h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
								Hello, I'm Napat.
							</h2>
							<div className="space-y-4 text-gray-600 dark:text-gray-400 leading-relaxed">
								<p>
									Currently architecting mission-critical platforms for PTT/PTTGC
									Group, working in regulated, high-stakes energy sector
									environments. My expertise spans C#, .NET Framework, SharePoint
									SPFx, Kendo UI, and modern JavaScript ecosystems.
								</p>
								<p>
									I specialize in complex authentication systems (MSAL),
									cross-platform browser compatibility, database optimization,
									and API architecture. I write code that balances elegance with
									maintainability, approaching every system with forward-thinking
									architecture.
								</p>
								<p>
									Bilingual (Thai/English) with international experience and a
									genuine curiosity about emerging technologies and industry
									evolution.
								</p>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-6">
							<div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
								<p className="text-3xl font-bold mb-1">15+</p>
								<p className="text-sm text-gray-500">Years Experience</p>
							</div>
							<div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
								<p className="text-3xl font-bold mb-1">50+</p>
								<p className="text-sm text-gray-500">Enterprise Projects</p>
							</div>
							<div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
								<p className="text-3xl font-bold mb-1">8+</p>
								<p className="text-sm text-gray-500">Core Technologies</p>
							</div>
							<div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
								<p className="text-3xl font-bold mb-1 text-lg">Global</p>
								<p className="text-sm text-gray-500">Clients</p>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Key Projects Section */}
			<section
				id="projects"
				className="py-24 px-6 bg-gray-50 dark:bg-gray-900/50"
			>
				<div className="max-w-5xl mx-auto">
					<p className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-3">
						Featured Work
					</p>
					<h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-12">
						Key Projects
					</h2>
					<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
						<div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
							<div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
								<svg
									className="w-6 h-6"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
									/>
								</svg>
							</div>
							<h3 className="text-lg font-semibold mb-2">GSP eMoC</h3>
							<p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-3">
								PTT/PTTGC Group
							</p>
							<p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
								Electronic Management of Change system for enterprise workflow
								coordination. Built with SharePoint SPFx, MSAL authentication,
								and sophisticated token management.
							</p>
						</div>
						<div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
							<div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4">
								<svg
									className="w-6 h-6"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
									/>
								</svg>
							</div>
							<h3 className="text-lg font-semibold mb-2">IdeaMANI</h3>
							<p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-3">
								PTT/PTTGC Group
							</p>
							<p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
								Investment type validation and portfolio management platform.
								Complex validation logic, cross-platform browser compatibility,
								and CORS configuration for enterprise integration.
							</p>
						</div>
						<div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
							<div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4">
								<svg
									className="w-6 h-6"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
									/>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
									/>
								</svg>
							</div>
							<h3 className="text-lg font-semibold mb-2">
								Stock Photography Business
							</h3>
							<p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-3">
								Entrepreneurial Venture
							</p>
							<p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
								Successful digital asset monetization business applying
								strategic SEO optimization, seasonal trend analysis, and market
								psychology for positioning.
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* Skills Section */}
			<section id="skills" className="py-24 px-6">
				<div className="max-w-5xl mx-auto">
					<p className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-3">
						What I Do
					</p>
					<h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-12">
						Skills & Expertise
					</h2>
					<div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
						{[
							{
								title: "Frontend Development",
								description:
									"Building enterprise-grade UIs with React, TypeScript, SharePoint SPFx, and Kendo UI for Fortune 500 clients.",
								icon: (
									<svg
										className="w-6 h-6"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={1.5}
											d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
										/>
									</svg>
								),
							},
							{
								title: "Backend & APIs",
								description:
									"Designing API architecture with C#, .NET Framework. Deep collaboration with backend teams and database architects.",
								icon: (
									<svg
										className="w-6 h-6"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={1.5}
											d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
										/>
									</svg>
								),
							},
							{
								title: "Auth & Security",
								description:
									"MSAL implementation, token management, localStorage strategies, Safari compatibility, and CORS configuration.",
								icon: (
									<svg
										className="w-6 h-6"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={1.5}
											d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
										/>
									</svg>
								),
							},
							{
								title: "Database & DevOps",
								description:
									"SQL Server optimization, index tuning, GitHub migration, SSH infrastructure, and server management.",
								icon: (
									<svg
										className="w-6 h-6"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={1.5}
											d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
										/>
									</svg>
								),
							},
						].map((skill) => (
							<div
								key={skill.title}
								className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
							>
								<div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-400 mb-4">
									{skill.icon}
								</div>
								<h3 className="text-lg font-semibold mb-2">{skill.title}</h3>
								<p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
									{skill.description}
								</p>
							</div>
						))}
					</div>

					{/* Tech Stack */}
					<div className="mt-16">
						<p className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-6">
							Tech Stack
						</p>
						<div className="flex flex-wrap gap-3">
							{[
								"C#",
								".NET Framework",
								"SharePoint SPFx",
								"TypeScript",
								"JavaScript",
								"React",
								"Kendo UI",
								"MSAL",
								"SQL Server",
								"REST APIs",
								"Tailwind CSS",
								"Git",
								"Cloudflare",
							].map((tech) => (
								<span
									key={tech}
									className="px-4 py-2 text-sm rounded-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
								>
									{tech}
								</span>
							))}
						</div>
					</div>
				</div>
			</section>

			{/* Hobbies Section */}
			<section
				id="hobbies"
				className="py-24 px-6 bg-gray-50 dark:bg-gray-900/50"
			>
				<div className="max-w-5xl mx-auto">
					<p className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-3">
						Beyond Code
					</p>
					<h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-12">
						Hobbies & Interests
					</h2>
					<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
						{[
							{
								title: "Music & Cultural Appreciation",
								description:
									"Passionate listener across K-pop and T-pop — Yerin Baek, LEE HI, Minsu, Bol4, and Serious Bacon. Appreciating quality vocal performances and diverse musical styles.",
								emoji: "🎵",
							},
							{
								title: "Literary Engagement",
								description:
									"Active novel reader with consistent engagement in literary content, providing intellectual balance to technical work and broadening creative perspective.",
								emoji: "📚",
							},
							{
								title: "Pet Care & Responsibility",
								description:
									"Dedicated caretaker for Thuaifu, a 15-year-old senior cat companion. Managing health with analytical veterinary care and unwavering commitment.",
								emoji: "🐱",
							},
						].map((hobby) => (
							<div
								key={hobby.title}
								className="group p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
							>
								<span className="text-3xl mb-4 block">{hobby.emoji}</span>
								<h3 className="text-lg font-semibold mb-2">{hobby.title}</h3>
								<p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
									{hobby.description}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Contact Section */}
			<section id="contact" className="py-24 px-6">
				<div className="max-w-3xl mx-auto text-center">
					<p className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-3">
						Get in Touch
					</p>
					<h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
						Let's Connect
					</h2>
					<p className="text-gray-600 dark:text-gray-400 mb-10 leading-relaxed">
						I'm always open to discussing enterprise solutions, creative
						collaborations, or opportunities to architect mission-critical
						systems.
					</p>
					<div className="flex flex-wrap justify-center gap-4">
						<a
							href="mailto:hello@example.com"
							className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors"
						>
							<svg
								className="w-4 h-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
								/>
							</svg>
							Email Me
						</a>
						<a
							href="https://github.com"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
						>
							<svg
								className="w-4 h-4"
								fill="currentColor"
								viewBox="0 0 24 24"
							>
								<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
							</svg>
							GitHub
						</a>
						<a
							href="https://linkedin.com"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
						>
							<svg
								className="w-4 h-4"
								fill="currentColor"
								viewBox="0 0 24 24"
							>
								<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
							</svg>
							LinkedIn
						</a>
					</div>
				</div>
			</section>

			{/* Footer */}
			<footer className="py-8 px-6 border-t border-gray-100 dark:border-gray-800">
				<div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
					<p>&copy; 2026 Napat Sangsong. All rights reserved.</p>
					<p>Built with React Router & Tailwind CSS</p>
				</div>
			</footer>
		</div>
	);
}
