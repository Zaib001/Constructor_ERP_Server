const projectsService = require('./projects.service');

const projectsController = {
    async getAll(req, res) {
        try {
            const companyId = req.user.companyId;
            const page = parseInt(req.query.page) || 1;
            const pageSize = parseInt(req.query.pageSize) || 50;
            
            const result = await projectsService.getAll(req.user, page, pageSize);
            res.json(result);
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    },

    async getById(req, res) {
        try {
            const project = await projectsService.getById(req.params.id, req.user);
            if (!project) return res.status(404).json({ message: 'Project not found or access denied' });
            res.json(project);
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    },

    async create(req, res) {
        try {
            const project = await projectsService.create(req.body, req.user);
            res.status(201).json(project);
        } catch (err) {
            res.status(400).json({ message: err.message });
        }
    },

    async update(req, res) {
        try {
            const project = await projectsService.update(req.params.id, req.user, req.body);
            res.json(project);
        } catch (err) {
            const status = err.message.includes("not found") ? 404 : 400;
            res.status(status).json({ message: err.message });
        }
    },

    async delete(req, res) {
        try {
            await projectsService.delete(req.params.id, req.user);
            res.json({ message: 'Project archived (Soft Delete)' });
        } catch (err) {
            const status = err.message.includes("not found") ? 404 : 400;
            res.status(status).json({ message: err.message });
        }
    }
};

module.exports = projectsController;
