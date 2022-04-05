// This store is for problem sets, user sets, merged user sets and set problems.

import { api } from 'boot/axios';
import { defineStore } from 'pinia';

import { useSessionStore } from './session';
import { useUserStore } from './users';

import { parseProblemSet, ProblemSet, ParseableProblemSet } from 'src/common/models/problem_sets';
import { MergedUserSet, ParseableUserSet,
	parseUserSet, UserSet } from 'src/common/models/user_sets';
import { LibraryProblem, SetProblem, ParseableProblem, parseProblem,
	ParseableSetProblem } from 'src/common/models/problems';
import { logger } from 'src/boot/logger';
import { ResponseError } from 'src/common/api-requests/interfaces';

import { User } from 'src/common/models/users';

export interface ProblemSetState {
	problem_sets: ProblemSet[];
	user_sets: UserSet[];
}

const createMergedUserSet = (user_set: UserSet, problem_set: ProblemSet, user: User) => {
	return new MergedUserSet({
		user_set_id: user_set.user_set_id,
		set_id: user_set.set_id,
		course_user_id: user_set.course_user_id,
		set_version: user_set.set_version,
		set_visible: user_set.set_visible,
		set_name: problem_set.set_name,
		username: user.username,
		set_type: problem_set.set_type,
		set_params: user_set.set_params,
		set_dates: user_set.set_dates
	});
};

export const useProblemSetStore = defineStore('problem_sets', {
	state: (): ProblemSetState => ({
		problem_sets: [],
		user_sets: [],
	}),
	getters: {
		// Returns all user sets merged with a user and a problem set.
		merged_user_sets: (state) => state.user_sets.map(user_set => {
			const user_store = useUserStore();
			const course_user = user_store.course_users.find(u => u.course_user_id === user_set.course_user_id);
			return createMergedUserSet(
				user_set as UserSet,
				state.problem_sets.find(set => set.set_id === user_set.set_id) as ProblemSet,
				(user_store.users.find(u => u.user_id === course_user?.user_id) as User) ??
					new User()
			);
		}),
		// Return a Problem Set from a set_id or set_name
		findProblemSet: (state) => (set_info: {set_id?: number, set_name?: string}) =>
			set_info.set_id ?
				state.problem_sets.find(set => set.set_id === set_info.set_id) :
				state.problem_sets.find(set => set.set_name === set_info.set_name),
		findUserSet: (state) => (set_info: { set_id?: number, set_name?: string }) => {
			if (set_info.set_id) {
				return state.user_sets.filter(user_set => user_set.set_id === set_info.set_id);
			} else if (set_info.set_name) {
				const set = state.problem_sets.find(set => set.set_name === set_info.set_name);
				if (set) {
					return state.user_sets.filter(user_set => user_set.set_id === set.set_id);
				} else {
					return [];
				}
			} else {
				return [];
			}
		}
	},
	actions: {
		async fetchProblemSets(course_id: number): Promise<void> {
			const response = await api.get(`courses/${course_id}/sets`);
			const sets_to_parse = response.data as Array<ParseableProblemSet>;
			logger.debug(`[problem_sets/fetchProblemSets] parsing response: ${sets_to_parse.join(', ')}`);
			this.problem_sets = sets_to_parse.map((set) => parseProblemSet(set));
		},
		async addProblemSet(set: ProblemSet): Promise<ProblemSet> {
			const response = await api.post(`courses/${set.course_id}/sets`, set.toObject());
			const new_set = parseProblemSet(response.data as ParseableProblemSet);
			this.problem_sets.push(new_set);
			return new_set;
		},
		async updateSet(set: ProblemSet): Promise<{ error: boolean; message: string }> {
			const response = await api.put(`courses/${set.course_id}/sets/${set.set_id}`, set.toObject());
			let message = '';
			let is_error = false;
			if (response.status === 200) {
				const updated_set = parseProblemSet(response.data as ParseableProblemSet);
				if (JSON.stringify(updated_set) !== JSON.stringify(set)) {
					logger.error('[updateSet] response does not match requested update to set');
				}
				message = `${updated_set.set_name} was successfully updated.`;
				const index = this.problem_sets.findIndex(s => s.set_id === set.set_id);
				this.problem_sets[index] = updated_set;
			} else {
				const error = response.data as ResponseError;
				message = error.message;
				is_error = true;
				logger.error(`Error updating set: ${message}`);
				// TODO: app-level error handling -- should throw here
			}

			return { error: is_error, message };

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
		async fetchUserSets(params: { course_id: number; set_id: number}) {
			const response = await api.get(`courses/${params.course_id}/sets/${params.set_id}/users`);
			const user_sets_to_parse = response.data as ParseableUserSet[];
			this.user_sets = user_sets_to_parse.map(user_set => parseUserSet(user_set));
		},
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
		async updateUserSet(set: UserSet): Promise<UserSet> {
			const sessionStore = useSessionStore();
			const course_id = sessionStore.course.course_id;

			const response = await api.put(`courses/${course_id}/sets/${set.set_id ?? 0}/users/${
				set.course_user_id ?? 0}`, set.toObject());
			const updated_user_set = parseUserSet(response.data as ParseableUserSet);
			// TODO: check for errors
			const index = this.merged_user_sets.findIndex(s => s.set_id === updated_user_set.set_id);
			this.user_sets.splice(index, 1, updated_user_set);
			return updated_user_set;
		},
		async deleteUserSet(user_set: UserSet) {
			const sessionStore = useSessionStore();
			const course_id = sessionStore.course.course_id;

			const response = await
			api.delete(`courses/${course_id}/sets/${user_set.set_id}/users/${user_set.course_user_id ?? 0}`);
			// TODO: check for errors
			const deleted_user_set = parseUserSet(response.data as ParseableUserSet);
			const index = this.merged_user_sets.findIndex(s => s.set_id === deleted_user_set.set_id);
			this.merged_user_sets.splice(index, 1);
			return deleted_user_set;
		},
	}
});
