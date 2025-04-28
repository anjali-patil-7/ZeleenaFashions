const User = require('../../models/userSchema');
const bcrypt = require('bcryptjs');

// Get all users with pagination and search
const getUsers = async (req, res) => {
    try {
        let page = parseInt(req.query.page) || 1;
        const limit = 5; // Changed to 5 users per page
        const searchQuery = req.query.query ? req.query.query.trim() : '';

        // Validate page number
        if (page < 1 || isNaN(page)) {
            page = 1;
        }

        console.log(`Page: ${page}, Search Query: ${searchQuery}, Limit: ${limit}`);

        // Build search conditions
        const searchConditions = {
            isAdmin: false, // Only fetch users with role 'user'
            ...(searchQuery && {
                $or: [
                    { name: { $regex: searchQuery, $options: 'i' } },
                    { email: { $regex: searchQuery, $options: 'i' } },
                    { phone: { $regex: searchQuery, $options: 'i' } }
                ]
            })
        };

        // Get total count for pagination
        const totalUsers = await User.countDocuments(searchConditions);
        let totalPages = Math.ceil(totalUsers / limit) || 1;

        // Redirect to last page if page exceeds totalPages
        if (page > totalPages) {
            return res.redirect(`/admin/users?page=${totalPages}${searchQuery ? '&query=' + encodeURIComponent(searchQuery) : ''}`);
        }

        // Fetch users with pagination
        const users = await User.find(searchConditions)
            .select('name email phone isBlocked createdOn')
            .skip((page - 1) * limit)
            .limit(limit)
            .lean()
            .exec();

        // Transform users data for view
        const transformedUsers = users.map(user => ({
            id: user._id,
            userName: user.name,
            email: user.email,
            phone: user.phone || 'N/A',
            isAdmin: false,
            status: !user.isBlocked // Active if not blocked
        }));

        console.log(`Total Users: ${totalUsers}, Total Pages: ${totalPages}, Users Fetched: ${users.length}`);

        res.render('admin/users', {
            users: transformedUsers,
            currentPage: page,
            totalPages,
            searchQuery,
            messages: { error: req.flash('error'), success: req.flash('success') }
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        req.flash('error', 'Failed to load users. Please try again later.');
        res.render('admin/users', {
            users: [],
            currentPage: 1,
            totalPages: 1,
            searchQuery: '',
            messages: { error: req.flash('error'), success: req.flash('success') }
        });
    }
};

// Toggle user block status
const toggleUserStatus = async (req, res) => {
    try {
        const userId = req.params.userId;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Toggle block status
        user.isBlocked = !user.isBlocked;
        await user.save();

        res.json({
            success: true,
            status: !user.isBlocked, // Return new status (true = active)
            message: `User ${user.isBlocked ? 'blocked' : 'unblocked'} successfully`
        });
    } catch (error) {
        console.error('Error toggling user status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user status. Please try again.'
        });
    }
};

module.exports = {
    getUsers,
    toggleUserStatus
};