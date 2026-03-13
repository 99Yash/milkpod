import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	typedRoutes: true,
	reactCompiler: true,
	async redirects() {
		return [
			{
				source: '/asset/:id/chat/:threadId',
				destination: '/asset/:id?tab=chat&thread=:threadId',
				permanent: true,
			},
			{
				source: '/asset/:id/chat',
				destination: '/asset/:id?tab=chat',
				permanent: true,
			},
			{
				source: '/asset/:id/moments',
				destination: '/asset/:id?tab=moments',
				permanent: true,
			},
			{
				source: '/asset/:id/comments',
				destination: '/asset/:id?tab=comments',
				permanent: true,
			},
		];
	},
};

export default nextConfig;
