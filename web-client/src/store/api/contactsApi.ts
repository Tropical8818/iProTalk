import { baseApi } from './baseApi';

export const contactsApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        getContacts: builder.query({
            query: () => '/contacts',
            providesTags: ['Contact'],
        }),
        updateContactStatus: builder.mutation({
            query: (data: { action: 'add' | 'block' | 'remove'; target_uid: string }) => ({
                url: '/contacts/update',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Contact'],
        }),
    }),
});

export const { useGetContactsQuery, useUpdateContactStatusMutation } = contactsApi;
