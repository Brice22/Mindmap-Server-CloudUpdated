import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// This Thunk talks to your NestJS GraphQL Resolver
export const fetchGraph = createAsyncThunk('mindmap/fetchGraph', async () => {
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const response = await fetch(`${API_URL}/graphql`, {
  method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `{ getGraphData { nodes { id name } links { source target } } }`
    }),
  });
  return (await response.json()).data.getGraphData;
});

const mindmapSlice = createSlice({
  name: 'mindmap',
  initialState: { nodes: [], links: [], status: 'idle' },
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(fetchGraph.fulfilled, (state, action) => {
      state.nodes = action.payload.nodes;
      state.links = action.payload.links;
    });
  },
});

export default mindmapSlice.reducer;

