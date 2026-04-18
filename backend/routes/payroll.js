const express = require('express');
const router = express.Router();
const dbService = require('../services/supabase-db');

router.get('/', async (req, res) => {
    const { month } = req.query; // YYYY-MM
    if (!month) return res.status(400).json({ error: 'Month required' });

    try {
        const employees = await dbService.getAllEmployees();
        const attendance = await dbService.getAllAttendance();
        const advances = await dbService.getAllAdvances();
        const payments = await dbService.getAllPayments();

        const settingsData = await dbService.getSettings();
        const stdHours = parseFloat(settingsData.standardHours || 8.5);
        const slabBase = parseFloat(settingsData.slabHours || 6);

        const payroll = employees.map(emp => {
            const empAtt = attendance.filter(a =>
                a.employeeId === emp.id && a.date.startsWith(month)
            );

            const empAdv = advances.filter(a => {
                if (a.employeeId !== emp.id) return false;
                const deduct = a.deductionMonth || (a.date ? a.date.substring(0, 7) : '');
                return deduct === month;
            });

            const empPay = payments.filter(p => p.employeeId === emp.id && p.salaryMonth === month);
            const totalPaid = empPay.reduce((sum, p) => sum + p.amount, 0);

            empPay.sort((a, b) => new Date(b.date) - new Date(a.date));
            const lastPaymentDate = empPay.length > 0 ? empPay[0].date : null;
            const paymentProofs = empPay.filter(p => p.screenshot).map(p => p.screenshot);

            let totalSalary = 0;
            let totalFare = 0;
            let daysWorked = empAtt.length;

            empAtt.forEach(att => {
                let dailySalary = 0;
                const workedHours = parseFloat(att.workedHours);
                if (isNaN(workedHours)) return;

                const salary = parseFloat(emp.salary);
                const normalRate = salary / stdHours;

                if (att.sundayMode) {
                    dailySalary = salary;
                } else if (att.slabMode) {
                    if (workedHours > stdHours) {
                        const extraHours = workedHours - stdHours;
                        const slabRate = salary / slabBase;
                        dailySalary = (normalRate * stdHours) + (slabRate * extraHours);
                    } else {
                        dailySalary = normalRate * workedHours;
                    }
                } else {
                    dailySalary = normalRate * workedHours;
                }

                totalSalary += dailySalary;
                totalFare += (parseFloat(att.fare) || 0);
            });

            const totalAdvance = empAdv.reduce((sum, adv) => sum + (parseFloat(adv.amount) || 0), 0);

            let previousBalance = 0;
            const pastAtt = attendance.filter(a => a.employeeId === emp.id && a.date < `${month}-01`);
            let pastEarnings = 0;
            pastAtt.forEach(att => {
                let dailySalary = 0;
                const workedHours = parseFloat(att.workedHours);
                if (isNaN(workedHours)) return;

                const salary = parseFloat(emp.salary);
                const normalRate = salary / stdHours;

                if (att.sundayMode) {
                    dailySalary = salary;
                } else if (att.slabMode) {
                    if (workedHours > stdHours) {
                        const extraHours = workedHours - stdHours;
                        const slabRate = salary / slabBase;
                        dailySalary = (normalRate * stdHours) + (slabRate * extraHours);
                    } else {
                        dailySalary = normalRate * workedHours;
                    }
                } else {
                    dailySalary = normalRate * workedHours;
                }
                pastEarnings += dailySalary;
                pastEarnings += (parseFloat(att.fare) || 0);
            });

            const pastAdv = advances.filter(a => {
                if (a.employeeId !== emp.id) return false;
                const deduct = a.deductionMonth || (a.date ? a.date.substring(0, 7) : '');
                return deduct < month;
            });
            const pastDeductions = pastAdv.reduce((sum, adv) => sum + (parseFloat(adv.amount) || 0), 0);

            const pastPay = payments.filter(p => p.employeeId === emp.id && p.salaryMonth < month);
            const pastPaymentsTotal = pastPay.reduce((sum, p) => sum + p.amount, 0);

            previousBalance = Math.round(pastEarnings - pastDeductions - pastPaymentsTotal);

            const currentMonthNet = totalSalary + totalFare - totalAdvance;
            const netPayable = Math.round(currentMonthNet + previousBalance);
            const remainingDue = netPayable - totalPaid;

            return {
                employee: emp,
                daysWorked,
                salaryEarned: Math.round(totalSalary),
                fareTotal: totalFare,
                advancePaid: totalAdvance,
                previousBalance: previousBalance,
                currentMonthNet: Math.round(currentMonthNet),
                finalPayable: netPayable,
                paidTotal: totalPaid,
                remainingDue: remainingDue,
                lastPaymentDate,
                paymentProofs,
                status: remainingDue <= 0 ? 'Settled' : (totalPaid > 0 ? 'Partial' : 'Unpaid')
            };
        });

        res.json(payroll);
    } catch (e) {
        console.error('Payroll Error:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
