// This store is for problem sets, user sets, merged user sets and set problems.

import { api } from 'boot/axios';
import { defineStore } from 'pinia';

import { useSessionStore } from './session';
import { useUserStore } from './users';

import { parseProblemSet, ProblemSet, ParseableProblemSet } from 'src/common/models/problem_sets';
import { MergedUserSet, mergeUserSet, ParseableUserSet, parseMergedUserSet, parseUserSet, UserSet
} from 'src/common/models/user_sets';
import { logger } from 'src/boot/logger';
import { ResponseError } from 'src/common/api-requests/interfaces';

import { MergedUser } from 'src/common/models/users';

/**
 * This is an type to retrieve set info.
 */
type SetInfo =  { set_name: string; set_id?: never } | { set_id: number; set_name?: never};

type UserInfo =
	{ username: string; user_id?: never } |
	{ user_id: number; username?: never };

/**
 * This is an type to retrieve user set info.  This ensure either a user_set_id is passed
 * in or set info and User Info, but not too much.
 */
type UserSetInfo =
	{ user_set_id: number; set_id?: never; set_name?: never; user_id?: never; username?: never } |
	{ set_id: number; user_id: number; user_set_id?: never; set_name?: never; username?: never; } |
	{ set_id: number; username: string; user_set_id?: never; set_name?: never; user_id?: never; } |
	{ set_name: string; user_id: number; user_set_id?: never; set_id?: never; username?: never; } |
	{ set_name: string; username: string; user_set_id?: never; set_id?: never; user_id?: never; };
export interface ProblemSetState {
	problem_sets: ProblemSet[];
	user_sets: UserSet[];
}

export const useProblemSetStore = defineStore('problem_sets', {
	state: (): ProblemSetState => ({
		problem_sets: [],
		user_sets: [],
	}),
	getters: {
		// Returns all user sets merged with a user and a problem set.
		merged_user_sets: (state) => state.user_sets.map(user_set => {
			console.log(user_set);
			const problem_set = state.problem_sets.find(set => set.set_id == user_set.set_id);
			console.log(problem_set);
			const course_user = useUserStore().merged_users.find(u => u.course_user_id === user_set.course_user_id);
			console.log(course_user);
			return mergeUserSet(problem_set as ProblemSet, user_set as UserSet, course_user as MergedUser)
				?? new MergedUserSet();
		}),
		// Return a Problem Set from a set_id or set_name
		findProblemSet: (state) => (set_info: SetInfo) =>
			set_info.set_id ?
				state.problem_sets.find(set => set.set_id === set_info.set_id) :
				state.problem_sets.find(set => set.set_name === set_info.set_name),
		findUserSets: (state) => (set_info: SetInfo): UserSet[] => {
			if (set_info.set_id) {
				return state.user_sets.filter(user_set => user_set.set_id === set_info.set_id) as UserSet[];
			} else if (set_info.set_name) {
				const set = state.problem_sets.find(set => set.set_name === set_info.set_name);
				if (set) {
					return state.user_sets.filter(user_set => user_set.set_id === set.set_id) as UserSet[];
				} else {
					return [];
				}
			} else {
				return [];
			}
		},
		/**
		 * findMergedUserSet returns a merged user set for a given set id or set name
		 * and user_id or user_name
		 * @param state
		 */
		findMergedUserSet(state) {
			return (user_set_info: UserSetInfo): MergedUserSet => {
				const user_store = useUserStore();
				let user_set: UserSet;
				let problem_set: ProblemSet;
				let user: MergedUser;
				if (user_set_info.user_set_id) {
					user_set = (state.user_sets.find(set => set.user_set_id == user_set_info.user_set_id) as UserSet)
						?? new UserSet();
					problem_set = state.problem_sets.find(set => set.set_id === user_set.set_id) as ProblemSet;
					user = user_store.findMergedUser({ course_user_id: user_set.course_user_id });
				} else if (user_set_info.username) {
					problem_set = ((user_set_info.set_id ?
						state.problem_sets.find(set => set.set_id === user_set_info.set_id) :
						state.problem_sets.find(set => set.set_name === user_set_info.set_name))
							?? new ProblemSet()) as ProblemSet;
					user = user_store.findMergedUser({ username: user_set_info.username });
					user_set = state.user_sets.find(set => set.set_id === problem_set.set_id &&
						set.course_user_id === user.course_user_id) as UserSet ?? new UserSet();
				} else {
					// May be better to throw an error.
					user_set = new UserSet();
					problem_set = new ProblemSet();
					user = new MergedUser();
				}

				// return createMergedUserSet(user_set, problem_set, user);
				return parseMergedUserSet(Object.assign(user.toObject(), problem_set.toObject(),
					user_set.toObject())) ?? new MergedUserSet();
			};
		}
	},
	actions: {
		/**
		 * fetches all problem sets for the given course.
		 * @param {number} course_id -- the database course id.
		 */
		async fetchProblemSets(course_id: number): Promise<void> {
			const response = await api.get(`courses/${course_id}/sets`);
			const sets_to_parse = response.data as Array<ParseableProblemSet>;
			this.problem_sets = sets_to_parse.map((set) => parseProblemSet(set));
		},
		/**
		 * adds a problem set to the store and the database.
		 * @param {ProblemSet} set -- the set to add to the database.
		 * @returns {Promise<ProblemSet>} the added problem set.
		 */
		async addProblemSet(set: ProblemSet): Promise<ProblemSet> {
			const response = await api.post(`courses/${set.course_id}/sets`, set.toObject());
			const new_set = parseProblemSet(response.data as ParseableProblemSet);
			this.problem_sets.push(new_set);
			return new_set;
		},
		/**
		 * updates a set in the store and the database.
		 * @param {ProblemSet} set -- the problem set to be updated.
		 */
		// async updateSet(set: ProblemSet): Promise<{ error: boolean; message: string }> {
		async updateSet(set: ProblemSet): Promise<ProblemSet | undefined> {
			const response = await api.put(`courses/${set.course_id}/sets/${set.set_id}`, set.toObject());
			// let message = '';
			// let is_error = false;
			if (response.status === 200) {
				const updated_set = parseProblemSet(response.data as ParseableProblemSet);
				// This is being handled in the tests, so we probably don't need to test for each
				// request.
				if (JSON.stringify(updated_set) !== JSON.stringify(set)) {
					logger.error('[updateSet] response does not match requested update to set');
				}
				// message = `${updated_set.set_name} was successfully updated.`;
				const index = this.problem_sets.findIndex(s => s.set_id === set.set_id);
				this.problem_sets[index] = updated_set;
				return updated_set;
			} else {
				const error = response.data as ResponseError;
				// message = error.message;
				// is_error = true;
				logger.error(`Error updating set: ${error.message}`);
				throw new Error(error.message);
				// TODO: app-level error handling -- should throw here
			}

			// return { error: is_error, message };

			// The following is not working.  TODO: fix-me
			// if (JSON.stringify(set) === JSON.stringify(_set)) {
			// commit('UPDATE_PROBLEM_SET', _set);
			// } else {
			// logger.error(`Problem set #${_set.set_id ?? 0} failed to update properly.`);
			// }

		},
		async deleteProblemSet(set: ProblemSet) {
			const response = await api.delete(`courses/${set.course_id}/sets/${set.set_id}`);
			const set_to_delete = parseProblemSet(response.data as ParseableProblemSet);
			const index = this.problem_sets.findIndex(set => set.set_id === set_to_delete.set_id);
			if (index >= 0) {
				this.problem_sets.splice(index, 1);
			}
			// TODO: what if this fails
			return set_to_delete;
		},
		// UserSet actions
		/**
		 * fetchAllUserSets fetches all user sets for a given course.
		 * @param course_id: number
		 */
		async fetchAllUserSets(course_id: number) {
			const response = await api.get(`courses/${course_id}/user-sets`);
			const user_sets_to_parse = response.data as ParseableUserSet[];
			this.user_sets = user_sets_to_parse.map(user_set => parseUserSet(user_set));
		},
		/**
		 * fetch all user sets in a given course with a given set_id
		 * @param params -- the course_id and set_id as database is.
		 */
		async fetchUserSets(params: { course_id: number; set_id: number}) {
			const response = await api.get(`courses/${params.course_id}/sets/${params.set_id}/users`);
			const user_sets_to_parse = response.data as ParseableUserSet[];
			this.user_sets = user_sets_to_parse.map(user_set => parseUserSet(user_set));
		},
		/**
		 * fetches all user sets for a given user in the current course (from the session)
		 * @param {UserInfo} params - either a username or user_id
		 * @returns an array of user sets for a given user.
		 */
		async fetchUserSetsForUser(params: UserInfo) {
			const course_id = useSessionStore().course.course_id;
			const user_store = useUserStore();
			let user_id: number;
			if (params.username) {
				const user = user_store.users.find(u => u.username === params.username);
				user_id = user?.user_id ?? 0;
			} else {
				user_id = params.user_id ?? 0;
			}
			const response = await api.get(`courses/${course_id}/users/${user_id}/sets`);
			this.user_sets = (response.data as ParseableUserSet[]).map(user_set => parseUserSet(user_set));
		},
		/**
		 * adds a User Set to the store and the database.
		 * @param {UserSet} user_set - the user set to add.
		 * @returns the added user set.
		 */
		async addUserSet(user_set: UserSet): Promise<UserSet | undefined> {
			const course_id = useSessionStore().course.course_id;
			const response = await api.post(`courses/${course_id}/sets/${user_set.set_id}/users`, user_set.toObject());
			// TODO: check for errors
			const user_set_to_add = parseUserSet(response.data as ParseableUserSet);
			if (user_set_to_add) {
				this.user_sets.push(user_set_to_add);
				return user_set_to_add;
			}
		},
		/**
		 * updates a User Set to the store and the database.
		 * @param {UserSet} user_set - the user set to be updated.
		 * @returns the updated user set.
		 */
		async updateUserSet(set: UserSet): Promise<UserSet> {
			const sessionStore = useSessionStore();
			const course_id = sessionStore.course.course_id;

			const response = await api.put(`courses/${course_id}/sets/${set.set_id ?? 0}/users/${
				set.course_user_id ?? 0}`, set.toObject());
			const updated_user_set = parseUserSet(response.data as ParseableUserSet);

			// TODO: check for errors
			const index = this.user_sets.findIndex(s => s.user_set_id === updated_user_set.user_set_id);
			this.user_sets.splice(index, 1, updated_user_set);
			return updated_user_set;
		},
		/**
		 * deletes a User Set from the store and the database.
		 * @param {UserSet} user_set - the user set to delete.
		 * @returns the deleted user set.
		 */
		async deleteUserSet(user_set: UserSet) {
			const course_id = useSessionStore().course.course_id;
			const response = await
			api.delete(`courses/${course_id}/sets/${user_set.set_id}/users/${user_set.course_user_id ?? 0}`);
			// TODO: check for errors
			const deleted_user_set = parseUserSet(response.data as ParseableUserSet);
			const index = this.user_sets.findIndex(s => s.user_set_id === deleted_user_set.user_set_id);
			this.user_sets.splice(index, 1);
			return deleted_user_set;
		},
		clearAll() {
			this.user_sets = [];
			this.problem_sets = [];
		}
	}
});
