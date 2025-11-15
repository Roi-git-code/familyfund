

// routes/memberRoutes.js - Updated with next of kin handling
const express = require('express');
const router = express.Router();
const memberModel = require('../models/memberModel');
const {
    sendMemberRegistrationEmail,
    sendMemberUpdateEmail,
    sendMemberDeletionEmail
} = require('../utils/mail');
const { requireAuth, requireRole, allowRoles } = require('../middleware/auth');


// GET ROUTES
// GET Registration Form
router.get('/form', (req, res) => {
  const formData = req.session.formData || {};
  
  console.log('[DEBUG] Member form accessed - formData:', {
    hasData: !!req.session.formData,
    memberName: formData.first_name ? `${formData.first_name} ${formData.sur_name}` : 'No data',
    kin1: formData.kin1_first_name || 'No kin1',
    kin2: formData.kin2_first_name || 'No kin2'
  });
  
  req.session.formData = null; // clear after using
  
  res.render('memberRegistration-form', {
    formData,
    editMode: false,
    user: req.session.user || null
  });
});


// GET Edit Form
router.get('/edit/:id', async (req, res) => {
    try {
        const member = await memberModel.getMemberById(req.params.id);
        if (!member) {
            req.flash('error', 'Member not found');
            return res.redirect('/member/form');
        }
        res.render('memberEditing-form', {
            formData: member,
            editMode: true,
            user: req.session.user || null
        });
    } catch (err) {
        console.error('Edit GET error:', err);
        req.flash('error', 'Failed to load member for editing');
        res.redirect('/member/form');
    }
});

// GET All Members
router.get('/', async (req, res) => {
    try {
        const members = await memberModel.getAllMembers();
        res.render('chairman', { members });
    } catch (err) {
        console.error('Get members error:', err);
        req.flash('error', 'Error loading members');
        res.redirect('/');
    }
});

// GET Member Details for Modal
router.get('/details/:id', async (req, res) => {
    try {
        const member = await memberModel.getMemberWithKins(req.params.id);
        if (!member) {
            return res.status(404).json({ error: 'Member not found' });
        }
        res.json(member);
    } catch (err) {
        console.error('Get member details error:', err);
        res.status(500).json({ error: 'Failed to get member details' });
    }
});

// GET Next of Kin for Member
router.get('/next-of-kin/:id', async (req, res) => {
    try {
        const kins = await memberModel.getNextOfKinsByMemberId(req.params.id);
        res.json(kins);
    } catch (err) {
        console.error('Get next of kin error:', err);
        res.status(500).json({ error: 'Failed to get next of kin' });
    }
});

// POST ROUTES
// POST Register Member
router.post('/', async (req, res) => {
    try {
        req.session.formData = req.body;
        
        // Create member and get the created member data
        const newMember = await memberModel.createMember(req.body);
        
        // Create next of kins if provided
        if (req.body.kin1_first_name && req.body.kin1_sur_name) {
            await memberModel.createNextOfKin(newMember.id, {
                first_name: req.body.kin1_first_name,
                middle_name: req.body.kin1_middle_name,
                sur_name: req.body.kin1_sur_name,
                gender: req.body.kin1_gender,
                email: req.body.kin1_email,
                phone: req.body.kin1_phone,
                address: req.body.kin1_address,
                relationship: req.body.kin1_relationship
            });
        }
        
        if (req.body.kin2_first_name && req.body.kin2_sur_name) {
            await memberModel.createNextOfKin(newMember.id, {
                first_name: req.body.kin2_first_name,
                middle_name: req.body.kin2_middle_name,
                sur_name: req.body.kin2_sur_name,
                gender: req.body.kin2_gender,
                email: req.body.kin2_email,
                phone: req.body.kin2_phone,
                address: req.body.kin2_address,
                relationship: req.body.kin2_relationship
            });
        }

        // Send registration success email
        if (newMember && newMember.email) {
            try {
                await sendMemberRegistrationEmail(newMember.email, {
                    memberName: `${newMember.first_name} ${newMember.sur_name}`,
                    memberId: newMember.id,
                    registrationDate: newMember.created_at
                });
                console.log(`✅ Registration email sent to: ${newMember.email}`);
            } catch (emailError) {
                console.error('❌ Failed to send registration email:', emailError);
            }
        }

        req.flash('success', 'Member registered successfully!');
        req.session.formData = null;
        res.redirect('/member/form');
    } catch (err) {
        console.error('Registration error:', err);
        let errorMessage = err.message || 'Error processing registration';
        if (err.message.includes('full name')) errorMessage = 'A member with this full name already exists';
        else if (err.message.includes('Email')) errorMessage = 'Email already exists';
        else if (err.message.includes('Phone')) errorMessage = 'Phone number already exists';
        else if (err.message.includes('Missing')) errorMessage = 'Please fill all required fields';
        else if (err.message.includes('Invalid email')) errorMessage = 'Invalid email format';
        else if (err.message.includes('Phone number should')) errorMessage = 'Phone number should be 8-15 digits';

        req.flash('error', errorMessage);
        res.redirect('/member/form');
    }
});

// POST Update Member
router.post('/update/:id', async (req, res) => {
    try {
        req.session.formData = req.body;
        const memberId = req.params.id;

        // Get current member data before update
        const currentMember = await memberModel.getMemberById(memberId);

        // Update member
        await memberModel.updateMember(memberId, req.body);

        // Handle next of kin updates
        const existingKins = await memberModel.getNextOfKinsByMemberId(memberId);
        
        // Update or create next of kin 1
        if (req.body.kin1_first_name && req.body.kin1_sur_name) {
            const kin1Data = {
                first_name: req.body.kin1_first_name,
                middle_name: req.body.kin1_middle_name,
                sur_name: req.body.kin1_sur_name,
                gender: req.body.kin1_gender,
                email: req.body.kin1_email,
                phone: req.body.kin1_phone,
                address: req.body.kin1_address,
                relationship: req.body.kin1_relationship
            };
            
            if (existingKins[0]) {
                await memberModel.updateNextOfKin(existingKins[0].id, kin1Data);
            } else {
                await memberModel.createNextOfKin(memberId, kin1Data);
            }
        }

        // Update or create next of kin 2
        if (req.body.kin2_first_name && req.body.kin2_sur_name) {
            const kin2Data = {
                first_name: req.body.kin2_first_name,
                middle_name: req.body.kin2_middle_name,
                sur_name: req.body.kin2_sur_name,
                gender: req.body.kin2_gender,
                email: req.body.kin2_email,
                phone: req.body.kin2_phone,
                address: req.body.kin2_address,
                relationship: req.body.kin2_relationship
            };
            
            if (existingKins[1]) {
                await memberModel.updateNextOfKin(existingKins[1].id, kin2Data);
            } else {
                await memberModel.createNextOfKin(memberId, kin2Data);
            }
        }

        // Send update notification email
        if (currentMember && currentMember.email) {
            try {
                const officerName = req.session.user ?
                    `${req.session.user.first_name || ''} ${req.session.user.sur_name || ''}`.trim() || req.session.user.username :
                    'System Administrator';

                await sendMemberUpdateEmail(currentMember.email, {
                    memberName: `${currentMember.first_name} ${currentMember.sur_name}`,
                    memberId: currentMember.id,
                    updateDate: new Date(),
                    updatedBy: officerName
                });
                console.log(`✅ Update email sent to: ${currentMember.email}`);
            } catch (emailError) {
                console.error('❌ Failed to send update email:', emailError);
            }
        }

        req.flash('success', 'Member updated successfully!');
        req.session.formData = null;
        res.redirect('/member');
    } catch (err) {
        console.error('Update error:', err);
        let errorMessage = err.message || 'Failed to update member';
        req.flash('error', errorMessage);
        res.redirect(`/member/edit/${req.params.id}`);
    }
});

// DELETE Member
router.post('/delete/:id', async (req, res) => {
    try {
        const id = req.params.id;

        // Get member data before deletion for email
        const memberToDelete = await memberModel.getMemberById(id);

        // Delete member (this will cascade delete next of kin due to foreign key constraint)
        await memberModel.deleteMember(id);

        // Send deletion notification email
        if (memberToDelete && memberToDelete.email) {
            try {
                const officerName = req.session.user ?
                    `${req.session.user.first_name || ''} ${req.session.user.sur_name || ''}`.trim() || req.session.user.username :
                    'System Administrator';

                await sendMemberDeletionEmail(memberToDelete.email, {
                    memberName: `${memberToDelete.first_name} ${memberToDelete.sur_name}`,
                    memberId: memberToDelete.id,
                    deletionDate: new Date(),
                    deletedBy: officerName
                });
                console.log(`✅ Deletion email sent to: ${memberToDelete.email}`);
            } catch (emailError) {
                console.error('❌ Failed to send deletion email:', emailError);
            }
        }

        req.flash('success', `Member ID ${id} deleted successfully!`);
    } catch (err) {
        console.error('Delete error:', err);
        req.flash('error', `Failed to delete member: ${err.message}`);
    }
    res.redirect('/member');
});

module.exports = router;


