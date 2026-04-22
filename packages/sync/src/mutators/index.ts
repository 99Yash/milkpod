import {
	momentCreateArgsSchema,
	momentCreateClient,
	momentDeleteArgsSchema,
	momentDeleteClient,
	momentUpdateArgsSchema,
	momentUpdateClient,
} from './moments';
import {
	commentCreateArgsSchema,
	commentCreateClient,
	commentDeleteArgsSchema,
	commentDeleteClient,
	commentUpdateArgsSchema,
	commentUpdateClient,
} from './comments';

export * from './moments';
export * from './comments';

/**
 * Client-side mutator bodies, keyed by the name Replicache uses to dispatch
 * push mutations. The server has a parallel map (different signatures, SQL
 * instead of k/v) identified by the same names.
 */
export const clientMutators = {
	momentCreate: momentCreateClient,
	momentUpdate: momentUpdateClient,
	momentDelete: momentDeleteClient,
	commentCreate: commentCreateClient,
	commentUpdate: commentUpdateClient,
	commentDelete: commentDeleteClient,
};

export type ClientMutators = typeof clientMutators;
export type MutatorName = keyof ClientMutators;

/**
 * Arg schemas indexed by mutator name. The server validates push payloads
 * against these before dispatching.
 */
export const mutatorArgsSchemas = {
	momentCreate: momentCreateArgsSchema,
	momentUpdate: momentUpdateArgsSchema,
	momentDelete: momentDeleteArgsSchema,
	commentCreate: commentCreateArgsSchema,
	commentUpdate: commentUpdateArgsSchema,
	commentDelete: commentDeleteArgsSchema,
};
