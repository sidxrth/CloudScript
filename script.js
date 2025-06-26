document.addEventListener('DOMContentLoaded', () => {
    const postForm = document.getElementById('postForm');
    const loadingOverlay = document.getElementById('loadingOverlay');

    postForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // Prevent default form submission

        // Show the loading animation
        loadingOverlay.classList.add('active');

        const postTitle = document.getElementById('postTitle').value;
        const postContent = document.getElementById('postContent').value;

        // Retrieve the username from sessionStorage
        const loggedInUsername = sessionStorage.getItem('loggedInUsername');
        // Use 'Guest User' as a fallback if no username is found in session storage
        const authorUsername = loggedInUsername || 'Guest User';

        // For the 'author' field, you might want to use the full name if available,
        // or just the username. For simplicity, let's use the username for both for now,
        // but typically 'author' might be a more formal name and 'username' the login ID.
        const authorDisplayName = loggedInUsername || 'Guest User';


        try {
            const response = await fetch('http://44.210.136.188/api/posts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: postTitle,
                    content: postContent,
                    author: authorDisplayName, // Using the display name for the author field
                    username: authorUsername // Passing the username to be stored in the DB
                }),
            });

            const data = await response.json();

            if (response.ok) {
                console.log('Post created successfully:', data);
                // Optionally store confirmation message or post ID for success page
                sessionStorage.setItem('lastPostTitle', postTitle);
                sessionStorage.setItem('postStatus', 'success'); // Indicate success
                window.location.href = 'post-success.html'; // Redirect to the success page
            } else {
                console.error('Error creating post:', data.message);
                alert('Failed to publish post: ' + data.message);
                loadingOverlay.classList.remove('active'); // Hide loading on error
            }
        } catch (error) {
            console.error('Network error or unexpected issue:', error);
            alert('An error occurred while publishing the post. Please try again.');
            loadingOverlay.classList.remove('active'); // Hide loading on error
        }
    });
});
