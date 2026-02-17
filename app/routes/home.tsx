import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "Napat Sangsong — Personal Portfolio" },
		{
			name: "description",
			content:
				"Personal portfolio of Napat Sangsong — developer, creator, and lifelong learner.",
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
						Software Developer
					</p>
					<p className="text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
						Passionate about building clean, efficient, and meaningful digital
						experiences. I love turning ideas into reality through code.
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
									I'm a software developer based in Thailand with a passion for
									crafting clean and user-friendly applications. I enjoy working
									across the full stack, from building intuitive interfaces to
									designing robust backend systems.
								</p>
								<p>
									I believe in writing code that is not only functional but also
									maintainable and elegant. Every project is an opportunity to
									learn something new and push boundaries.
								</p>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-6">
							<div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
								<p className="text-3xl font-bold mb-1">3+</p>
								<p className="text-sm text-gray-500">Years Experience</p>
							</div>
							<div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
								<p className="text-3xl font-bold mb-1">10+</p>
								<p className="text-sm text-gray-500">Projects Completed</p>
							</div>
							<div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
								<p className="text-3xl font-bold mb-1">5+</p>
								<p className="text-sm text-gray-500">Technologies</p>
							</div>
							<div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
								<p className="text-3xl font-bold mb-1">&infin;</p>
								<p className="text-sm text-gray-500">Curiosity</p>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Skills Section */}
			<section
				id="skills"
				className="py-24 px-6 bg-gray-50 dark:bg-gray-900/50"
			>
				<div className="max-w-5xl mx-auto">
					<p className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-3">
						What I Do
					</p>
					<h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-12">
						Skills & Expertise
					</h2>
					<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
						{[
							{
								title: "Frontend Development",
								description:
									"Building responsive, accessible, and performant user interfaces with React, TypeScript, and modern CSS.",
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
								title: "Backend Development",
								description:
									"Designing APIs and server-side applications with Node.js, Python, and cloud-native architectures.",
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
								title: "Database & DevOps",
								description:
									"Managing databases, CI/CD pipelines, and cloud deployments for reliable and scalable systems.",
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
								className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
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
								"TypeScript",
								"React",
								"Node.js",
								"Python",
								"Tailwind CSS",
								"PostgreSQL",
								"Docker",
								"Git",
								"Cloudflare",
								"REST APIs",
							].map((tech) => (
								<span
									key={tech}
									className="px-4 py-2 text-sm rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
								>
									{tech}
								</span>
							))}
						</div>
					</div>
				</div>
			</section>

			{/* Hobbies Section */}
			<section id="hobbies" className="py-24 px-6">
				<div className="max-w-5xl mx-auto">
					<p className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-3">
						Beyond Code
					</p>
					<h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-12">
						Hobbies & Interests
					</h2>
					<div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
						{[
							{
								title: "Music Enthusiast",
								description:
									"Passionate listener across K-pop (Yerin Baek, LEE HI, Minsu, Bol4) and T-pop (Serious Bacon), appreciating quality vocal performances.",
								emoji: "🎵",
							},
							{
								title: "Avid Reader",
								description:
									"Active novel reader with consistent engagement in literary content, providing intellectual balance to my technical career.",
								emoji: "📚",
							},
							{
								title: "Stock Photography Entrepreneur",
								description:
									"Operate a successful digital graphics business, applying SEO optimization and seasonal trend analysis.",
								emoji: "📸",
							},
							{
								title: "Pet Care Advocate",
								description:
									"Dedicated caretaker for Thuaifu, a senior feline companion, managing health with analytical veterinary care.",
								emoji: "🐱",
							},
						].map((hobby) => (
							<div
								key={hobby.title}
								className="group p-6 rounded-2xl border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
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
			<section
				id="contact"
				className="py-24 px-6 bg-gray-50 dark:bg-gray-900/50"
			>
				<div className="max-w-3xl mx-auto text-center">
					<p className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-3">
						Get in Touch
					</p>
					<h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
						Let's Connect
					</h2>
					<p className="text-gray-600 dark:text-gray-400 mb-10 leading-relaxed">
						I'm always open to discussing new projects, creative ideas, or
						opportunities to be part of something great.
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
