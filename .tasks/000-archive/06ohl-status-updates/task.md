Some agent harnesses have an `update_thread_status(label, description)` tool available; let's use that in our skills (if available) to indicate how things are going.
I'm thinking of using emojis for the labels to keep things compact.
📚 for research
📝 for plan
👷 for implement
👍 for commit

and then pair those with status indicator emojis
🏃 for in-progress
🚫 for blocked
✅ for completed

So the 'label' would consist of two emojis next to each other. And description is optional, so we can leave it out, or let the llm decide what to put there.
